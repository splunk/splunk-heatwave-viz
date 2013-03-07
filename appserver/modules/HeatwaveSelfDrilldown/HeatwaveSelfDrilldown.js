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

Splunk.Module.HeatwaveSelfDrilldown = $.klass(Splunk.Module, {

    initialize: function($super, container) {
        $super(container);
    },

    parseSearchType: function(searchString){
        var pattern = /([^by]*)$/;
        var endOfSearchString = searchString.toString().split(pattern);
        var arrayOfWords = endOfSearchString[1].split(" ");
        var type = arrayOfWords[1]
        return type;
    },

    createDrilldownSearch: function(searchArray,field){
        var newSearchArray = [];
        newSearchArray[0] = searchArray[1];
        var command = this.parseSearchType(searchArray[2]);
        newSearchArray[1] = "| search "+command+"="+field+" ";
        newSearchArray[2] = searchArray[2];

        var newSearchString = (newSearchArray[0]+newSearchArray[1]+newSearchArray[2]).toString();
        console.log(newSearchString);
        return newSearchString;

    },

    parseSearchPattern: function(pattern, searchString){
        var newSearch = searchString.toString().split(pattern);
        return newSearch;
    },

    parseSearchString: function(searchString){
        var pattern1 = /^(.+)(?=\|[\s?]`heatwave)/; // [\s?] space is optional between the | and w/e comes after.
        var pattern2 = /^(.+)(?=\|[\s?]timechart)/;
        if(searchString.toString().indexOf("`heatwave") !== -1){
            return this.parseSearchPattern(pattern1, searchString);
        }
        if(searchString.toString().indexOf("timechart") !== -1){
            console.log(this.parseSearchPattern(pattern2, searchString))
            return this.parseSearchPattern(pattern2, searchString);
        }
        return searchString;
    },

    modifyContext: function() {
        console.log("I GOT TO modifyContext");
        var context = this.getContext(),
            search = context.get("search"),
            searchArray = this.parseSearchString(search),  //ERROR searchArray is not always an array in parseSearchString fix!
            requiredFieldList = search.getRequiredFieldList(),
            epochStart = requiredFieldList[0],
            epochEnd = requiredFieldList[1],
            field = requiredFieldList[2],
            span = requiredFieldList[3];
        if(typeof searchArray !== "string"){
            console.log(searchArray[2]);
            var newSearch = this.createDrilldownSearch(searchArray,field);
        }else{
            var newSearch = search;
        }

        search.abandonJob();

        // index="os" sourcetype="ps" host=* | multikv fields pctCPU, COMMAND | timechart avg(pctCPU) by COMMAND limit=30
        // index="os" sourcetype="ps" host=* | multikv fields pctCPU, COMMAND | search COMMAND="Spotify" | timechart count by pctCPU limit=0 span=1.3

        console.log("this is the newSearch: "+newSearch);

        //var drilldownSearch = newSearch.concat("| search "+groupByField+"=\""+field+"\"");

        var epochTimeRange = new Splunk.TimeRange(epochStart, epochEnd),
            searchRange  = epochTimeRange;

        //search.setBaseSearch(drilldownSearch);
        search.setTimeRange(searchRange);
        context.set("search", search);

        this.pushContextToChildren(context);

    },

    onModifiedContext: function(){
        this.modifyContext();
    },

    onContextChange: function(){
        this.modifyContext();
    },

    pushContextToChildren: function($super, explicitContext){
        return $super(explicitContext);
    }

});
