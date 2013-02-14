Splunk.Module.timelineheatmap = $.klass(Splunk.Module.DispatchingModule, {

	initialize: function($super, container) {
		//console.log("I GOT TO initialize");
        	//console.log($super,container);
		HeatMapPlot.init();
		$super(container);
	},
	
	onBeforeJobDispatched: function(search) {
		search.setMinimumStatusBuckets(1);
		search.setRequiredFields(["*"]);
	},
	
	onJobProgress: function(event) {
		console.log("I GOT TO onJobProgress");
        	var context = this.getContext();
                var search = context.get("search");

		/*if (!search.job.isDone()) {
   			search.job.pause(
      				function() { console.log('Current job successfully paused!'); },
      				function() { console.log('Failed to pause current job!'); } );
		} else {
   			console.log('Current job has already completed!');
		}*/

                //console.log("This is the search url: " + search.getUrl("events"));
		//console.log("This.getResults() " + this.getResults());
		this.getResults();
    	},

	// override
	getResultURL: function(params) {
		//console.log("I GOT TO getResultsURL");
		var context = this.getContext();
		var search = context.get("search");
		//console.log("Search ID in getResultsURL: " + search.job.getSearchId());
		var searchJobId = search.job.getSearchId(); 
		var uri = Splunk.util.make_url("splunkd/search/jobs/" + searchJobId + "/results_preview?output_mode=json");
		//console.log("This is the uri in getResultURL " + uri);
		return uri;
	},


	getResultParams: function($super) {
		//console.log("I GOT TO getResultsParams");
		var params = $super();
        	var context = this.getContext();
		//console.log(context);
        	var search = context.get("search");
        	var sid = search.job.getSearchId();
	
       	 	if (!sid) this.logger.error(this.moduleType, "Assertion Failed.");
		
        	params.sid = sid;
		//console.log("Params: " + params);
        	return params;
	
	},
	
	renderResults: function($super, jString) {
		//console.log("I GOT TO renderResults");
		if (!jString) {
		 	return;
		}

		//console.log("Data: ");
                //console.log(jString);
				
		var resultDict;
		if (jString.results === undefined){
			resultsDict = eval(jString);
		}else{			
			resultsDict = jString.results;
		}	
		//console.log(resultsDict);
		$("document").ready(function() {
                	HeatMapPlot.plot(resultsDict);
        	});
	}	
});
