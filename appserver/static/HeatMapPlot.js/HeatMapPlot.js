var HeatMapPlot = {

    init: function(){

        var svg= d3.select("svg"), // d3.select(this.container).select("svg")

            heatMap= svg.append("g")
            .attr("class","heatMap");

        heatMap.append("g")
            .attr("class", "axis x");

        heatMap.append("g")
         .attr("class", "axis y");
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
            tmp._extent= d3.extent(tmp, HeatMapPlot.getValue);
            var firstBucket= HeatMapPlot.getBucket(tmp[0]);
            tmp._bucketSize= firstBucket[1]-firstBucket[0];
            data.push(tmp);
        }

        //console.log(data)
        return data;
    },

    plot: function(jString){

        if (jString.length === 0){
            return;
        } else if (jString[0].count === 0){
            return;
        }


        const durationTime = 500, size= 10, yoff= 20, xoff= 100, padding= 50, colorOffset=1;

        var svg= d3.select("svg"),
            heatMap= svg.select("g.heatMap"),
            data= this.parseData(jString),
            join= heatMap.selectAll("g.col").data(data, HeatMapPlot.getMeta),
            span= data[0]._span;

        if (span === undefined) {
            console.log("Span is undefined!");
            return;
        }

        var svgW= parseInt(svg.style("width")),
            svgH= parseInt(svg.style("height")),
            heatMapWidth= svgW-xoff*2,
            xDom= d3.extent(data, HeatMapPlot.getTime);

        if (HeatMapPlot.x === undefined){ //special case on first call
            var tmp= HeatMapPlot.calcTimeLowerBound(xDom[0], heatMapWidth, size, span);
            HeatMapPlot.x= d3.time.scale().domain([tmp, xDom[0]]).range([0, heatMapWidth]);
        }

        var timeLowerBound= HeatMapPlot.calcTimeLowerBound(xDom[1], heatMapWidth, size, span),
            x= d3.time.scale().domain([timeLowerBound, xDom[1]]).range([0, heatMapWidth]);

        var newColumns= addColumns(join);

        var xAxis= d3.svg.axis()
            .scale(x)
            .orient("bottom")
            .ticks(3)
            .tickSubdivide(10)
            .tickSize(6,3,3);

        var bucketSize= data[0]._bucketSize,
            currentCols= heatMap
                .selectAll("g.col")
                .filter(inRange)
                .filter(same),
            allData= currentCols.data(),
            yDom= [d3.min(allData, function (colData) { return HeatMapPlot.getBucket(colData[0])[0]; }), //selectAll rect?
                d3.max(allData, function (colData) { return HeatMapPlot.getBucket(colData[colData.length-1])[1]; })],
            nBuckets= d3.max(allData, function (d) { return d.length; }),
            wishHeigth= (svgH-padding) / nBuckets,
            height= d3.min([d3.max([wishHeigth,2]),10]),
            heatMapHeight= nBuckets * height,
            colorDom= [d3.min(allData, function (d) { return d._extent[0]; }) + colorOffset,
                d3.max(allData, function (d){ return d._extent[1]; }) + colorOffset],
            color= d3.scale.log().domain(colorDom).range(["white","#CC0000"]),
            y= d3.scale.linear().domain(yDom).range([heatMapHeight, 0]);

        var yAxis= d3.svg.axis()
            .scale(y)
            .orient("left")
            .ticks(nBuckets)
            .tickSubdivide(0)
            .tickSize(6,3,3);

        heatMap.transition().duration(durationTime).ease("linear")
            .attr("transform", "translate(" + xoff + "," + (svgH - heatMapHeight - padding) + ")");

        heatMap.select("g.axis.y").transition().duration(durationTime).ease("linear")
            .call(yAxis);

        heatMap.select("g.axis.x").transition().duration(durationTime).ease("linear")
            .attr("transform", "translate(0," + (heatMapHeight + 1) + ")")
            .call(xAxis);


        currentCols.each(updateRects)
            .call(move);

        heatMap.selectAll("g.cols")
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
                .call(place)
                .call(shape)
                .append("title")
                .call(title, colData);

            join.transition().duration(durationTime).ease("linear")
                .style("fill", toColor)
                .call(place)
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
            return d._span === span && d._bucketSize === bucketSize;
        }

        function move(selection) {
            selection
                .transition().duration(durationTime).ease("linear")
                .attr("transform", function (d) { return "translate(" + x(d._time) + ",0)"; })
                .attr("opacity", 1);
        }

        function moveIn(selection) {
            selection
                .attr("opacity", 0)
                .attr("transform", function (d) { return "translate(" + HeatMapPlot.x(d._time) + ",0)"; });
        }

        function shape(selection) {
            selection
                .attr("width", size)
                .attr("height", height)
                .style("fill", toColor);
                //.style("stroke", toColor)
                //.style("stroke-width",1)
        }

        function place(selection) {
            selection
                .attr("y", function(d) {
                    return y(HeatMapPlot.getBucket(d)[1]);
                });
        }

        HeatMapPlot.x= x;
    },

    calcTimeLowerBound: function(time, length, size, span) {
        return new Date(time.getTime() - (length / size) * span * 1000)
    },

    getTime: function (d) {
        return d._time;
    },

    getMeta: function (d) {
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
    }

};
