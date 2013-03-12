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

Splunk.Module.HeatwaveDrilldown = $.klass(Splunk.Module, {


    initialize: function($super, container) {
        $super(container);
    },

    modifySearch: function(searchString, field, span){

        searchString = searchString.replace("thisFieldWillBeSpecifiedByClick", "\""+field+"\"");
        searchString = searchString.replace("thisSpanWillBeSpecifiedOnDrilldown", span);

        console.log("This is the modifiedSearch: "+searchString);
        return searchString;
    },

    getModifiedContext: function() {
        var context = this.getContext(),
            search  = context.get("search"),
            requiredFieldList = search.getRequiredFieldList(),
            epochStart = requiredFieldList[0],
            epochEnd = requiredFieldList[1],
            field = requiredFieldList[2],
            span = requiredFieldList[3];
        search.abandonJob();

        console.log("This is the oldSearch: "+  search);

        if (this.sid) {
            search.job = Splunk.Globals.Jobber.buildJob(this.sid);
            context.set("search", search);
            return context;
        }

        if (this._params.hasOwnProperty('search')) {
            var searchString = this._params['search'],
                newSearch = this.modifySearch(searchString, field, span);
            search.setBaseSearch(newSearch);
        }
        if (this._params["earliest"] || this._params["latest"]) {
            var range = new Splunk.TimeRange(this._params["earliest"], this._params["latest"]);
            search.setTimeRange(range);
        }else{
            var range = new Splunk.TimeRange(epochStart, epochEnd);
            search.setTimeRange(range);
        }

        context.set("search", search);
        return context;
    }

});
