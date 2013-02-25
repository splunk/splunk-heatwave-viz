Splunk.Module.Heatwave = $.klass(Splunk.Module.DispatchingModule, {

    plot: function(jString){

        if (jString.length === 0){
            return;
        } else if (jString[0].count === 0){
            return;
        }


        const durationTime = 500, xoff= 100, padding= 50, colorOffset=1;


        var HeatMapPlot= this,
            data = this.parseData(jString);

        var join= this.heatMap.selectAll("g.col").data(data, HeatMapPlot.getMetaData),
            span= data[0]._span;

        // Remove already existing columns (only duplicates).
        join.exit().remove();

        if (span === undefined) {
            console.log("ERROR - Span is undefined!");
            return;
        }

        var svgW= parseInt(this.svg.style("width")),
            svgH= parseInt(this.svg.style("height")),
            heatMapWidth= svgW-xoff*2,
            xDom= d3.extent(data, HeatMapPlot.getTime);


        const size = heatMapWidth/data.length;

        var columnsRequired = xDom[1].getTime()-xDom[0].getTime();

        var timeLowerBound = xDom[0];//HeatMapPlot.calcTimeLowerBound(xDom[1], heatMapWidth, size, span);
        HeatMapPlot.xScale= this.calculateXScale([xDom[0], xDom[1]], heatMapWidth);

        var newColumns= addColumns(join);

        var xAxis= d3.svg.axis()
            .scale(HeatMapPlot.xScale)
            .orient("bottom")
            .ticks(Math.min(5,(data.length/2)))
            .tickSubdivide(10)
            .tickSize(6,3,3);

        var bucketSpan= data[0]._bucketSpan,
            currentCols= this.heatMap
                .selectAll("g.col")
                .filter(inRange)
                .filter(same),
            allData= currentCols.data(),
            yDom= this.calculateYDomain(allData),
            nBuckets= (yDom[1]-yDom[0])/d3.max(allData, function (d) { return d._bucketSpan; }),
            heatMapHeight= svgH-padding,
            wishBucketHeigth= heatMapHeight / nBuckets,
            bucketHeight= wishBucketHeigth,//d3.min([d3.max([wishBucketHeigth,2]),50]),
            colorDom= [d3.min(allData, function (d) { return d._extent[0]; }) + colorOffset,
                d3.max(allData, function (d){ return d._extent[1]; }) + colorOffset],
            color= d3.scale.log().domain(colorDom).range(["white","#CC0000"]),
            yScale= this.calculateYScale(yDom, heatMapHeight);

        var yAxis= d3.svg.axis()
            .scale(yScale)
            .orient("left")
            .ticks(Math.min(nBuckets,10))
            .tickSubdivide(0)
            .tickSize(6,3,3);

        this.heatMap.transition().duration(durationTime).ease("linear")
            .attr("transform", "translate(" + xoff + "," + (svgH - heatMapHeight - padding + 5) + ")");

        this.heatMap.select("g.axis.y").transition().duration(durationTime).ease("linear")
            .call(yAxis);

        this.heatMap.select("g.axis.x").transition().duration(durationTime).ease("linear")
            .attr("transform", "translate(0," + (heatMapHeight + 1) + ")")
            .call(xAxis);

        currentCols.each(updateRects)
            .call(move);

        this.heatMap.selectAll("g.cols")
            .filter(function (d) { return !inRange(d) || !same(d); })
            .transition().duration(durationTime)
            .attr("opacity", 0)
            .remove();

        function addColumns(d3set) {
            return d3set.enter().insert("g","g.axis").attr("class", "col")
                .call(moveIn);
        }

        function updateRects(colData) {
            var rect= d3.select(this).selectAll("rect"),
                join= rect.data(colData, HeatMapPlot.getBucketStr);

            join.enter().insert("rect")
                .on("click", function(d) {
                    var metaData = d3.select(this).select("title").text(), //There should be better solution like this.parent.data()._time?
                        epoch= HeatMapPlot.metaTimeToEpoch(HeatMapPlot.parseMetaData(metaData));
                    HeatMapPlot.setMetaData(epoch, epoch + span);

                })
                .call(place)
                .call(shape)
                .append("title")
                .call(title, colData);

            join.transition().duration(durationTime).ease("linear")
                .style("fill", toColor)
                .call(place)
                .call(shape)
                .select("title")
                .call(title, colData);

            join.exit().remove();
        }

        function title(selection, colData) {
            selection
                .text(function(d) {return colData._time + ":" + d;})
        }

        function toColor(d) {
            return color(HeatMapPlot.getValue(d) + colorOffset);
        }

        function inRange(d) {
            return d._time > timeLowerBound && d._time < xDom[1];
        }

        function same(d) {
            return d._span === span && d._bucketSpan === bucketSpan;
        }

        function move(selection) {
            selection
                .transition().duration(durationTime).ease("linear")
                .attr("transform", function (d) { return "translate(" + HeatMapPlot.xScale(d._time) + ",0)"; })
                .attr("opacity", 1);
        }

        function moveIn(selection) {
            selection
                .attr("opacity", 0)
                .attr("transform", function (d) { return "translate(" + HeatMapPlot.xScale(d._time) + ",0)"; });
        }

        function shape(selection) {
            selection
                .attr("width", size)
                .attr("height", bucketHeight)
                .style("fill", toColor);
            //.style("stroke", toColor)
            //.style("stroke-width",1)
        }

        function place(selection) {
            selection
                .attr("y", function(d) {
                    return yScale(HeatMapPlot.getBucket(d)[1]);
                });
        }

        //HeatMapPlot.xScale= xScale;
    },

    calculateYDomain: function(data){
        var that= this;
        return [d3.min(data, function (colData) { return that.getBucket(colData[0])[0]; }), //selectAll rect?
            d3.max(data, function (colData) { return that.getBucket(colData[colData.length-1])[1]; })];
    },

    calculateYScale: function(domain, height){
        return d3.scale.linear().domain(domain).range([height, 0]);
    },

    updateXScale: function(domain, width) {

    },

    calculateXScale: function(domain, width) {
        return d3.time.scale().domain(domain).range([0, width]);
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
        return new Date(t.substring(st+1))
    },

    getBucket: function (d){
        var a= d.indexOf("-"),
            b= d.indexOf("=");
        return [parseFloat(d.substring(0,a)), parseFloat(d.substring(a+1,b))];
    },

    getBucketStr: function (d) {
        return d.substring(0,d.indexOf("="))
    },

    getValue: function (d){
        var st= d.indexOf("=");
        return eval(d.substring(st+1));
    },

    parseData: function(jString) {

        var data= [];
        //sort data according to bucket values
        for(var col=0; col<jString.length; col++){
            var tmp= [];
            for(var bucket in jString[col]){
                if(jString[col].hasOwnProperty(bucket) && bucket[0] !== "_"){
                    tmp.push(bucket + "=" + jString[col][bucket]);
                }
            }
            tmp.sort(function(a, b) { return parseFloat(a) - parseFloat(b); });
            tmp._time= new Date(jString[col]._time);
            tmp._span= eval(jString[col]._span);
            tmp._extent= d3.extent(tmp, this.getValue);
            var firstBucket= this.getBucket(tmp[0]);
            tmp._bucketSpan= firstBucket[1]-firstBucket[0];
            data.push(tmp);
        }

        //console.log(data)
        return data;
    },

    getTimeRange: function() {
        return this.getContext().get("search").getTimeRange();
    },

    //############################################################
    // MAIN WAVE RENDERING
    //############################################################

    initialize: function($super, container) {
        this.svg= d3.select("svg"); // d3.select(this.container).select("svg")
        this.heatMap= this.svg.append("g")
            .attr("class","heatMap");

        this.heatMap.append("g")
            .attr("class", "axis x");

        this.heatMap.append("g")
            .attr("class", "axis y");

        $super(container);

        //Time range parameters
        this.epochTimeRange;
        //Context flow gates
        this.doneUpstream = false;
        this.gettingResults = false;

    },

    parseMetaData: function(metaData){
        var pattern = /([^\(]+)/;
        var time = metaData.split(pattern);
        return time[1];
    },

    metaTimeToEpoch: function(metaData){
        var newDate = new Date(metaData.toString());
        return newDate.getTime()/1000.0;
    },

    setMetaData: function(epochStart, epochEnd){
        this.epochTimeRange = new Splunk.TimeRange(epochStart, epochEnd);

        var context = this.getContext(),
            search = context.get("search");
        search.abandonJob();

        if(typeof this.epochTimeRange !== "undefined"){
            var searchRange  = this.epochTimeRange; //new Splunk.TimeRange('1361303400','1361303460');
        }else{
            var searchRange = search.getTimeRange();
        }

        search.setTimeRange(searchRange);
        context.set("search", search);

        if(this.doneUpstream && !(this.gettingResults)){
            this.pushContextToChildren(context);
        }
    },

    onJobDone: function(){
        this.getResults();
    },

    onJobProgress: function(event) {
        this.getResults();
    },
    
    getResultURL: function(params) {
        var context = this.getContext();
        var search = context.get("search");
        var searchJobId = search.job.getSearchId();

        var uri = Splunk.util.make_url("splunkd/search/jobs/" + searchJobId + "/results_preview?output_mode=json");
        return uri;
    },

    getResults: function($super) {
        this.doneUpstream = true;
        this.gettingResults = true;
        return $super();
    },

    onBeforeJobDispatched: function(search) {
        search.setMinimumStatusBuckets(1);
        search.setRequiredFields(["*"]);
    },

    getResultParams: function($super) {
        var params = $super();
        var context = this.getContext();
        var search = context.get("search");
        var sid = search.job.getSearchId();

        if (!sid) this.logger.error(this.moduleType, "Assertion Failed.");

        params.sid = sid;
        return params;
    },

    getModifiedContext: function() {
        return this.getContext();
    },

    onContextChange: function() {
        var context = this.getContext();
        if (context.get("search").job.isDone()) {
            this.getResults();
        } else {
            this.doneUpstream = false;
        }
    },

    pushContextToChildren: function($super, explicitContext){
        return $super(explicitContext);
    },

    renderResults: function($super, jString) {
        if (!jString) {
            return;
        }

        var resultDict;
        if (jString.results === undefined){
            resultsDict = eval(jString);
        }else{
            resultsDict = jString.results;
        }

        var that= this;
        $("document").ready(function() {
            that.plot(resultsDict);
        });

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
    }
});
