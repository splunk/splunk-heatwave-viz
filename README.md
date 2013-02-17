splunk-heatwave-viz
===================

A heatmap vizualization of bucketed ranged data over time.
Visualization for data with fluctuating metrics on a continual basis.

Splunk is the premier technology for gaining Operational Intelligence on Machine Data. Since it
can handle large volume of data at a fast rate, often times users will only want to analyze
recent data, and data that is beyond a certain range, or data in realtime.

splunk-heatwave-viz is a visualization tool for data with fluctuating metrics on a continual basis.
Enabeling users to visualize for example latency data by a bucket-interval over a time-interval
where the intensity of events is represented as a heatmap throughout the buckets.

Installation:
-------------

 - Manager -> Apps -> Install app from file -> Choose File -> Upload
 - You are good to go

Searches:
---------

 The application comes with its own search macro called "timelineheatmap". That buckets
 your data on a format usable for the visualization in d3. The macro takes three arguments,
 a target_to_measure, a max_buckets, and a time_span.

        `timelineheatmap(target_to_measure,max_buckets,time_span)`

 It is used at the end of your query as in the following example.

 index="os" sourcetype="ps" | multikv fields pctCPU | stats sum(pctCPU) as pctCPU by _time |
 `timelineheatmap(pctCPU,30,10s)`

 You filter out a field target to measure over time (numeric value over time),
 then specify max number of data buckets, and the length of the time span to use.
 Note that these are relative to both the amount of data you are pushing into the
 visualization and the time range you set in the time range picker.
