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
        this.xScale= d3.time.scale();

        this.heatMap.append("g")
            .attr("class", "axis y");
        this.yScale= d3.scale.ordinal();

        this.colorOffset= 1;
        this.colorRange= [this.getParam("lowerColorRange"),
            this.getParam("upperColorRange")];

        this.colorScale= (this.getParam("colorScale") === "linear") ?
            d3.scale.linear() :
            d3.scale.log();

        this.nDrilldownBuckets= 30;
        this.rowLimit = 50;
        this.padding= 25;

        this.requiredFields = [];
        //Context flow gates
        this.doneUpstream = false;
        this.gettingResults = false;
        this.setClicked(false);

        $(window).resize(this.rerender.bind(this));
    },

    getParam : function(str) {
        return this._params[str];
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
        console.log("getModifiedContext");

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

        var context = this.getContext(),
            search = context.get("search");

        if (this.searchQueryIsProper()){
            var limit = this.verifySearchLimit(context,search);
            if (limit > this.rowLimit){
                console.log("Limit is currently: "+limit);
                console.log("Limit can only take values less than "+this.rowLimit);
                search.job.cancel();
                console.log("The job is canceled.");
            }
        }else{
            search.job.cancel();
            console.log("The job is canceled.");
        }

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

    searchQueryIsProper: function(){
        var context = this.getContext(),
            search = context.get("search"),
            subSearch = search.toString().substr(search.toString().lastIndexOf('|'));

        if (subSearch.indexOf("timechart") === -1){
            console.log("The search query does not end with a timechart command.");
            return false;
        }
        if (subSearch.indexOf("timechart") !== -1 && subSearch.indexOf("by") === -1){
            console.log("The timechart command is missing a 'by' clause.");
            return false;
        }
        return true;
    },

    verifySearchLimit: function(context,search){
        var subSearch = this.getSubSearch(search),
            limit = 0;

        if(this.searchContainsLimit(subSearch)){
            limit = this.getSearchLimit(subSearch);
        }
        return limit;
    },

    getSubSearch: function(search){
        var subSearch = search.toString().substr(search.toString().lastIndexOf('|'));
        return subSearch;
    },

    searchContainsLimit: function(subSearch){
        if(subSearch.indexOf("limit") === -1){
            return false;
        }else{
            return true;
        }
    },

    getSearchLimit: function(subSearch){
        var pattern = /limit=\d+/,
            limit = subSearch.match(pattern)[0].split("=")[1];
        return limit;
    },

    onJobProgress: function(event) {
        if(!this.searchQueryIsProper()){
            return;
        }
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

    renderResults: function($super, data) {
        if (!data.results.length){
            console.log("INFO - Waiting for data");
            return;
        }
        if (!data.span){
            console.log("ERROR - Span is undefined!");
            return;
        }
        this.plot(data);
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

    plot: function(inData){

        this.updateSvgDimensions();

        var self= this,
            data = inData.results,
            fields = d3.map(inData.fields),
            heatMapHeight= this.calculateHeatMapHeight();

        this.updateSpan(inData);

        data.forEach(function (d) { d._time= new Date(d._time); });

        if (this.getContext().get("search").job.isRealTimeSearch()){
            data.shift(); //Remove earliest column due to visual feature of "disappearing" buckets in realtime searches
        }

        this.updateYScaleDomain(fields);
        this.updateYScaleSize(heatMapHeight);
        this.renderYAxis();

        var heatMapWidth= this.calculateHeatMapWidth();

        this.updateXScaleDomain(data);
        this.updateXScaleSize(heatMapWidth);
        this.renderXAxis(heatMapHeight);
        this.updateColorScale(fields);

        this.updateHeatMapPosition(heatMapHeight);

        var join= this.heatMapStage.selectAll("g.col").data(data, self.getMetaData),
            newColumns= addColumns(join),
            currentCols= this.heatMapStage
                .selectAll("g.col")
                .filter(inRange);

        currentCols.each(updateRects)
            .call(this.move, this);

        this.transition(join.exit()
            .filter(function (d) { return !inRange(d); }))
            .attr("opacity", 0)
            .remove();

        function addColumns(d3set) {
            return d3set.enter().insert("g","g.axis").attr("class", "col")
                .call(moveIn);
        }

        function updateRects(colData) {
            var rect= d3.select(this).selectAll("rect"),
                join= rect.data(colData.result, self.getBucket);

            join.enter().insert("rect")
                .on("mouseover", function(d){
                    d3.select(this).style("fill", "lightblue").classed("selected", true);
                    self.heatMap.select("g.axis.y").selectAll("text").data(d, String).classed("selected",true);
                })
                .on("click", function(){
                    var metaData = d3.select(this).select("title").text(), //There should be better solution like this.parent.data()._time?
                        epoch= metaTimeToEpoch(parseMetaData(metaData)),
                        field = parseFieldFromMetaData(metaData),
                        colorDom= self.colorScale.domain(),
                        step= (colorDom[1]-colorDom[0]) / self.nDrilldownBuckets;
                        self.clicked(epoch, epoch + inData.span, field, step.toFixed(2));
                })
                .call(self.place, self)
                .call(self.shape, self)
                .style("fill", toColor)
                .append("title")
                .call(title, colData);

            join.on("mouseout", function(d){
                d3.select(this).style("fill", toColor(d)).classed("selected", false);
                self.heatMap.select("g.axis.y").selectAll("text").data(d, String).classed("selected",false);
            });

            self.transition(join)
                .call(self.place, self)
                .call(self.shape, self)
                .style("fill", toColor)
                .select("title")
                .call(title, colData);

            join.exit().remove();
        }

        function metaTimeToEpoch(metaData){
            var newDate = new Date(metaData.toString());
            return newDate.getTime()/1000.0;
        }

        function parseMetaData(metaData){
            var pattern = /([^\(]+)/,
                time = metaData.split(pattern);
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
            return self.colorScale(self.getValue(d) + self.colorOffset);
        }

        function inRange(d) {
            return d._time >= self.xDom[0] && d._time <= self.xDom[1];
        }

        function moveIn(selection) {
            selection
                .attr("opacity", 0)
                .attr("transform", function (d) {
                    return "translate(" + (self.xScale(d._time) + self.bucketWidth) + ",0)";
                });
        }
    },

    updateSvgDimensions: function(){
        this.svgW= this.parentDiv.node().getBoundingClientRect().width;
        this.svgH= this.parentDiv.node().getBoundingClientRect().height;
    },

    calculateHeatMapHeight: function(){
        return this.svgH-this.padding;
    },

    updateSpan: function(data){
        this.spanInUnixTime= data.span * 1000;
    },

    calculateHeatMapWidth: function(){
        var yAxisBoundingBox= this.heatMap.select("g.axis.y")[0][0].getBoundingClientRect();
        return this.svgW * 0.95 - yAxisBoundingBox.width;
    },

    move: function(selection, self) {
        self.transition(selection)
            .attr("transform", function (d) { return "translate(" + self.xScale(d._time) + ",0)"; })
            .attr("opacity", 1);
    },

    shape: function(selection, self) {
        selection
            .attr("width", self.bucketWidth)
            .attr("height", self.bucketHeight);
    },

    place: function(selection, self) {
        selection
            .attr("y", function(d) {
                return self.yScale(self.getBucket(d));
            });
    },

    transition: function(selection){
        return selection.transition().duration(500).ease("linear");
    },

    rerender: function (){
        this.updateSvgDimensions();
        var height= this.calculateHeatMapHeight();
        this.updateYScaleSize(height);
        this.renderYAxis();

        var width= this.calculateHeatMapWidth();

        this.updateXScaleSize(width);
        this.renderXAxis(height);

        this.heatMapStage.selectAll("g.col")
            .call(this.move, this);

        this.heatMapStage.selectAll("rect")
            .call(this.place, this)
            .call(this.shape, this);
    },

    updateBucketHeight: function (height){
        this.bucketHeight= height / this.yScale.domain().length;
    },

    updateBucketWidth: function(width) {
        // leave 1 pixel for space between columns
        var nColumns= (this.xDom[1].getTime() - this.xDom[0].getTime()) / (this.spanInUnixTime);
        this.bucketWidth = (width / nColumns)-1;
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
        return data.keys()
            .sort(function(a,b) { return parseFloat(normalize(a))-parseFloat(normalize(b));} );

        function normalize(str) {
            return str.replace(">","").replace("<","")
        }
    },

    updateYScaleDomain: function(data){
        var yDom= this.calculateYDomain(data);
        this.yScale.domain(yDom);
    },

    updateYScaleSize: function(height){
        this.yScale.rangeBands([height, 0]); //rangePoints for circles
        this.updateBucketHeight(height);
    },

    renderYAxis: function(){
        var yAxis= d3.svg.axis()
            .scale(this.yScale)
            .orient("left")
            .tickSize(6,3,3),
            axis= this.transition(this.heatMap.select("g.axis.y"))
                .call(yAxis),
            that= this;

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

    updateHeatMapPosition: function(heatMapHeight) {
        var yAxisBoundingBox= this.heatMap.select("g.axis.y")[0][0].getBoundingClientRect();

        this.transition(this.heatMap)
            .attr("transform", "translate(" + (yAxisBoundingBox.width * 1.10) + "," + (this.svgH - heatMapHeight - this.padding + 5) + ")");
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

    updateXScaleSize: function(width) {
        this.updateBucketWidth(width);
        this.xScale.range([0, width]);
    },

    renderXAxis: function(height){
        var xAxis= d3.svg.axis()
            .scale(this.xScale)
            .orient("bottom")
            .ticks(10)
            .tickSubdivide(10)
            .tickSize(6,3,3);

        this.transition(this.heatMap.select("g.axis.x"))
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

    updateXScaleDomain: function(data){
        var newXDom= d3.extent(data, this.getTime);

        newXDom[1]= this.addTime(newXDom[1], this.spanInUnixTime); //Changes time axis to deal with time spans not time points.

        if (!this.xDom) {
            this.xDom= newXDom;
        }
        else {
            // Include more data
            if (newXDom[0] < this.xDom[0]){
                this.xDom[0]= newXDom[0];
            }
            // Sift if realtime data appears
            if (newXDom[1] > this.xDom[1]){
                var time= newXDom[1].getTime() - this.xDom[1].getTime();
                this.shiftXDomain(time);
            }
        }

        this.xScale.domain(this.xDom);
    },

    updateColorScale: function(data) {
        var colorDom= [d3.min(data.values(), function (d) { return d.min; }) + this.colorOffset,
            d3.max(data.values(), function (d){ return d.max; }) + this.colorOffset];

        this.colorScale.domain(colorDom).range(this.colorRange);
    },

    updateThresholdLines : function(){
        var lowerThresholdLine= this.heatMap.selectAll("line.threshold.lower").data(this.lowerThreshold, function (d) {return d;}),
            upperThresholdLine= this.heatMap.selectAll("line.threshold.upper").data(this.upperThreshold, function (d) {return d;}),
            HeatMapPlot= this;

        function placeOver(d) { return HeatMapPlot.yScale(d); }

        lowerThresholdLine.enter().append("line")
            .call(this.horizontal, this, placeOver)
            .classed("threshold lower", true);

        this.transition(lowerThresholdLine)
            .attr({"y1": placeOver,
                "y2": placeOver});

        lowerThresholdLine.exit().remove();

        function placeUnder(d) { return HeatMapPlot.yScale(d) + HeatMapPlot.bucketHeight;}

        upperThresholdLine.enter().append("line")
            .call(this.horizontal, this, placeUnder)
            .classed("threshold upper", true);

        this.transition(upperThresholdLine)
            .attr({"y1": placeUnder,
                "y2": placeUnder});

        upperThresholdLine.exit().remove();
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
