/*   
   Copyright 2013 Splunk Inc

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

Splunk.Module.Heatwave = $.klass(Splunk.Module.DispatchingModule, {


    //############################################################
    // Main Module Logic
    //############################################################

    initialize: function($super, container) {
        $super(container);
        console.log("INITIALIZE IS RUN");

        this.parentDiv = d3.select(container).select("div");
        this.svg= d3.select(container).select("svg");
        this.heatMap= this.svg.append("g")
            .attr("class","heatMap");
        this.heatMapStage= this.heatMap.append("g")
            .attr("class","heatMapStage");

        this.heatMap.append("g")
            .attr("class", "axis x");
        this.heatMap.append("g")
            .attr("class", "axis y");

        this.durationTime = 500;
        this.colorOffset= 1;
        this.colorRange= [this.getParam("lowerColorRange","white"),
            this.getParam("upperColorRange","#CC0000")];

        this.colorScale= (this.getParam("colorScale","log") === "linear") ?
            d3.scale.linear() :
            d3.scale.log();

        this.nDrilldownBuckets= 30;

        this.requiredFields = [];
        //Context flow gates
        this.doneUpstream = false;
        this.gettingResults = false;
        this.sid= this.getSID();
        this.setClicked(false);
    },

    getParam : function(str, defaultValue) {
        var value= this._params[str];
        return value ? value : defaultValue;
    },

    getSID: function() {
        return this.getContext().get("search").job.getSID();
    },

    clicked: function(epochStart, epochEnd, field, span){
        this.setEpochStart(epochStart);
        this.setEpochEnd(epochEnd);
        this.setField(field);
        this.setSpan(span);

        this.setClicked(true);
        this.getModifiedContext();
        this.setClicked(false);

    },

    setClicked: function(state){
        this.isClicked = state;
    },

    getClicked: function(){
        return this.isClicked;
    },

    setEpochStart: function(epochStart) {
        this.epochStart = epochStart;
    },

    setEpochEnd: function(epochEnd) {
        this.epochEnd = epochEnd;
    },

    setField: function(field) {
        this.field = field;
    },

    setSpan: function(span) {
        this.span = span;
    },

    getEpochStart: function() {
        return this.epochStart;
    },

    getEpochEnd: function() {
        return this.epochEnd;
    },

    getField: function() {
        return this.field;
    },

    getSpan: function() {
        return this.span;
    },

    getResultURL: function(params) {
        var search = this.getContext().get('search'),
            searchJobId = search.job.getSID();

        if (search.job.isPreviewable()){
            var uri = Splunk.util.make_url("/splunkd/search/jobs/" + searchJobId + "/results_preview?output_mode=json");
        }else{
            var uri = Splunk.util.make_url("/splunkd/search/jobs/" + searchJobId + "/results?output_mode=json");
        }

        return uri;
    },

    getResultParams: function($super) {
        var params = $super();
        var sid = this.getSID();

        if (!sid) {
            this.logger.error(this.moduleType, "Assertion Failed.");
        }

        params.sid = sid;
        return params;
    },

    getModifiedContext: function() {
        if(this.getClicked()){
            var context = this.getContext(),
                search = context.get("search"),
                epochEnd = this.getEpochEnd(),
                epochStart = this.getEpochStart(),
                field = this.getField(),
                span = this.getSpan();
            search.abandonJob();

            //Check is needed since some splunk modules define endTime as false or undefined in allTime searches
            if(typeof epochEnd === false || typeof epochEnd === undefined){
                console.log("epochEnd is false or undefined");
                epochEnd = new Date().getTime() / 1000;

                var searchRange = new Splunk.TimeRange(epochStart,epochEnd);
                search.setTimeRange(searchRange);
            }
            this.setRequiredFields([epochStart,epochEnd,field,span]);
            search.setRequiredFields(this.getRequiredFields());

            context.set("search", search);

            if(this.doneUpstream && !(this.gettingResults)){
                this.pushContextToChildren(context);
            }
        }
        return this.getContext();
    },

    setRequiredFields: function(requiredFields){
        this.requiredFields = requiredFields;
    },

    getRequiredFields: function(){
        return this.requiredFields;
    },

    pushContextToChildren: function($super, explicitContext){
        return $super(explicitContext);
    },

    onContextChange: function() {
        this.onNewSIDClearPlot();
        var context = this.getContext();
        if (context.get("search").job.isDone()) {
            this.getResults();
        }else {
            this.doneUpstream = false;
        }
    },

    onNewSIDClearPlot: function() {
        var newSID= this.getSID();
        if ((this.sid) && (this.sid !== newSID)){
            this.clearPlot();
        }
        this.sid= newSID;
    },

    onJobProgress: function(event) {
        this.getResults();
    },

    onJobDone: function(){
        this.getResults();
    },

    getResults: function($super) {
        this.doneUpstream = true;
        this.gettingResults = true;
        return $super();
    },

    onBeforeJobDispatched: function(search) {
        search.setMinimumStatusBuckets(1);
    },

    renderResults: function($super, jString) {
        if (!jString || jString.toString().indexOf("<meta http-equiv=\"status\" content=\"400\" />") !== -1) {
            return;
        }

        if (jString.results === undefined){
            resultsDict = eval(jString);
        }else{
            resultsDict = jString.results;
        }

        var that= this;
        that.plot(resultsDict);

        this.gettingResults = false;
    },

    isReadyForContextPush: function($super) {

        if (!(this.doneUpstream)) {
            return Splunk.Module.DEFER;
        }
        if (this.gettingResults) {
            return Splunk.Module.DEFER;
        }
        return Splunk.Module.CONTINUE;
    },

    //############################################################
    // Main plot function
    //############################################################

    plot: function(jString){

        var padding= 50,
            HeatMapPlot= this,
            data = this.parseData(jString),
            svgW= this.parentDiv.node().getBoundingClientRect().width,
            svgH= this.parentDiv.node().getBoundingClientRect().height,
            heatMapHeight= svgH-padding,
            yAxisBoundingBox= this.heatMap.select("g.axis.y")[0][0].getBoundingClientRect(),
            heatMapWidth= svgW * 0.95 - yAxisBoundingBox.width;

        if (this.getContext().get("search").job.isRealTimeSearch()){
            data.shift(); //Remove earliest column due to visual feature of "disappearing" buckets in realtime searches
        }

        this.updateYScale(data, heatMapHeight);
        this.updateXScale(data, heatMapWidth, heatMapHeight);
        this.updateColorScale(data);
        this.updateThresholdLines();

        var join= this.heatMapStage.selectAll("g.col").data(data, HeatMapPlot.getMetaData),
            span= data[0]._span,
            newColumns= addColumns(join),
            bucketSpan= data[0]._bucketSpan,
            currentCols= this.heatMapStage
                .selectAll("g.col")
                .filter(inRange);

        if (span === undefined){
            console.log("ERROR - Span is undefined!");
            return;
        }

        this.heatMap.transition().duration(this.durationTime).ease("linear")
            .attr("transform", "translate(" + (yAxisBoundingBox.width * 1.05) + "," + (svgH - heatMapHeight - padding + 5) + ")");

        currentCols.each(updateRects)
            .call(move);

        join.exit()
            .filter(function (d) { return !inRange(d); })
            .transition().duration(this.durationTime)
            .attr("opacity", 0)
            .remove();

        function addColumns(d3set) {
            return d3set.enter().insert("g","g.axis").attr("class", "col")
                /*.on("mouseover", function (d) {
                    HeatMapPlot.onXAxisMouseOver(this, HeatMapPlot, d); })
                .on("mouseout", function (d) {
                    HeatMapPlot.onXAxisMouseOut(this, HeatMapPlot, d);})*/
                .call(moveIn);
        }

        function updateRects(colData) {
            var rect= d3.select(this).selectAll("rect"),
                join= rect.data(colData, HeatMapPlot.getBucket);

            join.enter().insert("rect")
                .on("mouseover", function(d){
                    d3.select(this).style("fill", "lightblue").classed("selected", true);
                    HeatMapPlot.heatMap.select("g.axis.y").selectAll("text").data(d, String).classed("selected",true);
                    //HeatMapPlot.onYAxisMouseOver(null, HeatMapPlot, HeatMapPlot.getBucket(d));
                })
                .on("click", function(){
                    var metaData = d3.select(this).select("title").text(), //There should be better solution like this.parent.data()._time?
                        epoch= metaTimeToEpoch(parseMetaData(metaData)),
                        field = parseFieldFromMetaData(metaData),
                        colorDom= HeatMapPlot.colorScale.domain(),
                        step= (colorDom[1]-colorDom[0]) / HeatMapPlot.nDrilldownBuckets;
                        HeatMapPlot.clicked(epoch, epoch + span, field, step.toFixed(2));
                })
                .call(place)
                .call(shape)
                .append("title")
                .call(title, colData);

            join.on("mouseout", function(d){
                d3.select(this).style("fill", toColor(d)).classed("selected", false);
                HeatMapPlot.heatMap.select("g.axis.y").selectAll("text").data(d, String).classed("selected",false);
                //HeatMapPlot.onYAxisMouseOut(null, HeatMapPlot, HeatMapPlot.getBucket(d));
            });

            join.transition().duration(this.durationTime).ease("linear")
                .style("fill", toColor)
                .call(place)
                .call(shape)
                .select("title")
                .call(title, colData);

            join.exit().remove();
        }

        function metaTimeToEpoch(metaData){
            var newDate = new Date(metaData.toString());
            return newDate.getTime()/1000.0;
        }

        function parseMetaData(metaData){
            var pattern = /([^\(]+)/;
            var time = metaData.split(pattern);
            return time[1];
        }

        function parseFieldFromMetaData(metaData){
            var metaDataArray = metaData.split(";");
            return metaDataArray[1].toString();
        }

        function title(selection, colData) {
            selection.text(function(d) {return colData._time + ";" + d[0] + ";" + d[1];});
        }

        function toColor(d) {
            return HeatMapPlot.colorScale(HeatMapPlot.getValue(d) + HeatMapPlot.colorOffset);
        }

        function inRange(d) {
            return d._time >= HeatMapPlot.xDom[0] && d._time <= HeatMapPlot.xDom[1];
        }

        function move(selection) {
            selection
                .transition().duration(HeatMapPlot.durationTime).ease("linear")
                .attr("transform", function (d) { return "translate(" + HeatMapPlot.xScale(d._time) + ",0)"; })
                .attr("opacity", 1);
        }

        function moveIn(selection) {
            selection
                .attr("opacity", 0)
                .attr("transform", function (d) {
                    return "translate(" + (HeatMapPlot.xScale(d._time) + HeatMapPlot.bucketWidth) + ",0)";
                });
        }

        function shape(selection) {
            selection
                .attr("width", HeatMapPlot.bucketWidth)
                .attr("height", HeatMapPlot.bucketHeight)
                .style("fill", toColor);
            //.style("stroke", toColor)
            //.style("stroke-width",1)
        }

        function place(selection) {
            selection
                .attr("y", function(d) {
                    return HeatMapPlot.yScale(HeatMapPlot.getBucket(d));
                });
        }

        //HeatMapPlot.xScale= xScale;
    },

    parseData: function(jString) {
        this.lowerThreshold= [];
        this.upperThreshold= [];
        var data= [];
        //sort data according to bucket values
        for(var col=0; col<jString.length; col++){
            var tmp= [];
            for(var bucket in jString[col]){
                if(jString[col].hasOwnProperty(bucket) && bucket[0] !== "_"){
                    if (bucket[0] === "<"){
                        this.lowerThreshold.push(bucket);
                    }
                    else if (bucket[0] === ">"){
                        this.upperThreshold.push(bucket);
                    }
                    var tmpBucket= bucket;//=this.getBucketFromStr(bucket);
                    tmp.push([tmpBucket, parseFloat(jString[col][bucket])]);
                }
            }
            tmp._time= new Date(jString[col]._time);
            tmp._span= eval(jString[col]._span);
            tmp._extent= d3.extent(tmp, this.getValue);
            //var firstBucket= tmp[0][0];
            tmp._bucketSpan= "None";//firstBucket[1]-firstBucket[0];
            data.push(tmp);
        }
        return data;
    },

    getValue: function (d) {
        return d[1];
    },
    
    clearPlot: function() {
        this.heatMapStage.selectAll("g.col").remove();
        this.xDom= null;

    },

    argmax: function(arr) {
        var lengths= arr.map(function (d) { return d.length; });
        return lengths.indexOf(d3.max(lengths));
    },

    calculateYDomain: function(data){
        var allFields= data.map(function (col) { return col.map( function (d) { return d[0]; }); });
        return d3.merge(allFields);
        //return data[this.argmax(data)].map(function (d) {return d[0];});
        //var that= this;
        //return [d3.min(data, function (colData) { return that.getBucket(colData[0])[0]; }), //selectAll rect?
        //    d3.max(data, function (colData) { return that.getBucket(colData[colData.length-1])[1]; })];
    },

    calculateYScale: function(domain, height){
        return d3.scale.ordinal().domain(domain).rangeBands([height, 0]);
        //return d3.scale.linear().domain(domain).range([height, 0]);
    },

    updateYScale: function(data, height){
        var yDom= this.calculateYDomain(data);

        this.yScale= this.calculateYScale(yDom, height);

        var nBuckets= this.yScale.domain().length;

        this.bucketHeight= height / (nBuckets);

        var yAxis= d3.svg.axis()
            .scale(this.yScale)
            .orient("left")
            .ticks(Math.min(nBuckets,10))
            .tickSubdivide(0)
            .tickSize(6,3,3);

        var axis= this.heatMap.select("g.axis.y").transition().duration(this.durationTime).ease("linear")
            .call(yAxis);

        var that= this;
        this.heatMap.select("g.axis.y").selectAll("text")
            .on("mouseover", function (d) { that.onYAxisMouseOver(this, that, d); })
            .on("mouseout", function (d) { that.onYAxisMouseOut(this, that, d); })
            .on("click", function (d) { that.drillDownOnYAxisField(d); });
    },

    onYAxisMouseOver: function (selection, that, d) {
        d3.select(selection).attr("class", "selected");

        that.heatMap.insert("line","line.threshold")
            .call(that.horizontal, that, that.yScale(d))
            .attr("class", "selection");

        that.heatMap.insert("line","line.threshold")
            .call(that.horizontal, that, that.yScale(d)+that.bucketHeight)
            .attr("class", "selection");
    },

    onYAxisMouseOut: function (selection, that, d) {
        d3.select(selection).attr("class","");
        that.heatMap.selectAll("line.selection").remove();
    },

    drillDownOnYAxisField: function(d){
        var context = this.getContext(),
            search = context.get("search"),
            timeRange = search.getTimeRange(),
            earliestTime = timeRange.getRelativeEarliestTime(),
            latestTime = timeRange.getRelativeLatestTime(),
            colorDom= this.colorScale.domain(),
            step= (colorDom[1]-colorDom[0]) / this.nDrilldownBuckets;
        this.clicked(earliestTime, latestTime, d, step.toFixed(2));
    },

    getTimeRange: function() {
        return this.getContext().get("search").getTimeRange();
    },

    onXAxisMouseOver: function (selection, that, d) {
        d3.select(selection).classed("selected", true);

        that.appendLine(that,
            that.xScale(d._time),
            that.xScale(d._time),
            0,
            that.yScale(""))
            .attr("class", "selection");

        that.appendLine(that,
            that.xScale(d._time) + that.bucketWidth,
            that.xScale(d._time) + that.bucketWidth,
            0,
            that.yScale(""))
            .attr("class", "selection");
    },

    onXAxisMouseOut: function (selection, that, d) {
        d3.select(selection).classed("selected",false);
        that.heatMap.selectAll("line.selection").remove();
    },

    appendLine: function(that, x1,x2,y1,y2) {
        return that.heatMap.insert("line","line.threshold")
            .attr("x1", x1)
            .attr("x2", x2)
            .attr("y1", y1)
            .attr("y2", y2);
    },

    horizontal: function(selection, that, y) {
        selection.attr("x1", that.xScale(that.xDom[0]))
            .attr("x2", that.xScale(that.xDom[1]))
            .attr("y1", y)
            .attr("y2", y);
    },

    updateXScale: function(data, width, height) {

        this.updateXDom(data);

        // leave 1 pixel for space between columns
        var nColumns= (this.xDom[1].getTime() - this.xDom[0].getTime()) / (data[0]._span * 1000);
        this.bucketWidth = (width / nColumns)-1;

        this.xScale= this.calculateXScale(this.xDom, width);

        var xAxis= d3.svg.axis()
            .scale(this.xScale)
            .orient("bottom")
            .ticks(10)
            .tickSubdivide(nColumns / 9)
            .tickSize(6,3,3);

        this.heatMap.select("g.axis.x").transition().duration(this.durationTime).ease("linear")
            .attr("transform", "translate(0," + (height) + ")")
            .call(xAxis);

    },

    addTime: function(date, time) {
        return new Date(date.getTime() + time);
    },

    shiftXDomain: function(time) {
        this.xDom[1]= this.addTime(this.xDom[1], time);
        this.xDom[0]= this.addTime(this.xDom[0], time);
    },

    updateXDom: function(data){
        var newXDom= d3.extent(data, this.getTime),
            span= data[0]._span * 1000;

        newXDom[1]= this.addTime(newXDom[1], span); //Changes time axis to deal with time spans not time points.

        if (!this.xDom)
        {
            this.xDom= newXDom;

            // Shift the xDomain 1 column to the right.
            //this.shiftXDomain(span);
        }
        else
        {
            // Include more data
            if (newXDom[0] < this.xDom[0]){
                this.xDom[0]= newXDom[0];
            }

            //console.log("old time:",this.xDom)
            //console.log("new time:",newXDom)

            // Sift if realtime data appears
            if (newXDom[1] > this.xDom[1]){
                var time= newXDom[1].getTime() - this.xDom[1].getTime();
                this.shiftXDomain(time);
            }
        }
    },

    calculateXScale: function(domain, width) {
        return d3.time.scale().domain(domain).range([0, width]);
    },

    updateColorScale: function(data) {
        var colorDom= [d3.min(data, function (d) { return d._extent[0]; }) + this.colorOffset,
            d3.max(data, function (d){ return d._extent[1]; }) + this.colorOffset];

        this.colorScale= this.colorScale.domain(colorDom).range(this.colorRange);
    },

    updateThresholdLines : function(){
        var lowerThresholdLine= this.heatMap.selectAll("line.threshold.lower").data(this.lowerThreshold, function (d) {return d;}),
            upperThresholdLine= this.heatMap.selectAll("line.threshold.upper").data(this.upperThreshold, function (d) {return d;}),
            HeatMapPlot= this;

        function placeOver(d) { return HeatMapPlot.yScale(d); }

        lowerThresholdLine.enter().append("line")
            .call(this.horizontal, this, placeOver)
            .classed("threshold lower", true);

        lowerThresholdLine.transition().duration(HeatMapPlot.durationTime)
            .attr({"y1": placeOver,
                "y2": placeOver});

        lowerThresholdLine.exit().remove();

        function placeUnder(d) { return HeatMapPlot.yScale(d) + HeatMapPlot.bucketHeight;}

        upperThresholdLine.enter().append("line")
            .call(this.horizontal, this, placeUnder)
            .classed("threshold upper", true);

        upperThresholdLine.transition().duration(HeatMapPlot.durationTime)
            .attr({"y1": placeUnder,
                "y2": placeUnder});

        upperThresholdLine.exit().remove();
    },

    calcTimeLowerBound: function(time, length, size, span) {
        time = time.getTime();
        var date = time - (length / size) * span * 1000;
        return new Date(date);
    },

    getTime: function (d) {
        return d._time;
    },

    getMetaData: function (d) {
        return d._time + "," + d._span;
    },

    toTime: function (t){
        var st= t.indexOf("=");
        return (t.substring(st+1));
    },

    getBucketFromStr: function (str){
        var dash= str.indexOf("-");
        return [parseFloat(str.substring(0,dash)), parseFloat(str.substring(dash+1))];
    },

    getBucket: function (d) {
        return d[0];
    },

    isNum: function(n) {
        return !isNaN(parseFloat(n)) && isFinite(n);
    }
});
