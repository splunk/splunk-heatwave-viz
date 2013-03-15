splunk-heatwave-viz
===================

### What heatwave is:
Heatwave is a time-based heatmap visualization. It operates on both historical/static data, 
as well as streamed/real-time data.

From Heatwave, you can see the distribution of measures in bucketed ranges on the y-axis, 
with time on the x-axis. Heatwave is vastly superior to the standard visualizations graphing 
derived measures avg/min/max/std, because Heatwave will show the actual spread and distribution 
of those measures (like a histogram) over time.

A canonical use case is to measure performance metrics such as throughput, or latency values. 
By using Heatwave, you can often see "clusters" that show up as "bands" over time, usually 
indicating underlying attribute influencing the metrics. From what you see in Heatwave, you can 
then drill down or filter in order to find the root cause of performance issues evidenced by 
the data.

### What heatwave comes with:
Splunk-heatwave-viz is both an app, and a module that you can integrate in your own dashboards. 
The app comes with a visualization module and a drill down module that enables you to specify 
drill down queries similar to that of splunk's own hidden search module. The module also comes 
with a threshold search command with which you can set an upper and lower bound for the data 
to be visualized. The heatwave module and the drill down module comes with a set of parameters
that can be applied though the xml.

Heatwave

title: Specifies title for the heat map plot. 
upperColorLimit: Specifies upper color for the color range of the plotted heat map.
lowerColorLimit: Specifies lower color for the color range of the plotted heat map.
colorScale: Specifies type of scale used for heat map coloring. Can be linear or log, 
default is log.

HeatwaveDrilldown

search: The literal search string HiddenSearch passes onto its child modules.
earliest: This is used to define a beginning time range. It is expected if 'latest' is also 
defined. It sets the start point of the time range to search within.
latest: This is used to define an ending time range. It is expected if 'earliest' is also 
defined. It sets the ending point of the time range to search within.

### Splunk:
Splunk is the premier technology for gaining Operational Intelligence on Machine Data. Since it
can handle large volume of data at a fast rate, often times users will only want to analyze
recent data, and data that is beyond a certain range, or data in realtime.

Installation:
-------------

- [Download Splunk for your platform](http://www.splunk.com/download?r=productOverview).
- Unpack/Install Splunk by running the downloaded files.
- Follow the instruction on the screen.

Splunk-heatwave-viz can either be installed directly from splunkbase or downloaded from github.
- If you install it from splunkbase all you have to do is follow the instructions on your screen.
- If you download it from splunkbase then extract the files into: SPLUNK_HOME/etc/apps/
- If you download it from github then go to your apps directory: SPLUNK_HOME/etc/apps/
	Download the app: git clone  https://github.com/splunk/splunk-heatwave-viz.git
*You might have to restart splunk in order to apply the changes. 

Use case examples:
-----------------

### Unix
In the following example we will view the percentage load of a cpu over time,
with relation to the top 30 processes that are running during the specified timespan. 

![Unix 1](https://raw.github.com/splunk/splunk-heatwave-viz/develop/examples/unix1.png "Hearwave: Percentage cpu load per process")
In the above image we see how Heatwave integrates well with other splunk modules such as the
SearchBar and FlashTimeline. For example, if one would want to narrow the time range and only
view the events between 3:30 and 3:35 it could be limited in the FlashTimeline and then passed
down to the Heatwave which is its child module.

![Unix 2](https://raw.github.com/splunk/splunk-heatwave-viz/develop/examples/sg2.png "Heatwave: Drilldown to specific process")
The above image illustrates the Heatwave drill down functionality. Here a parent Heatwave 
displays the top 30 processes running on a system during the specified time. As a user you can
drill down on a specific process and view its behavior with finer granularity. Which is 
displayed in the bottom Heatwave. 

![Unix 3](https://raw.github.com/splunk/splunk-heatwave-viz/develop/examples/unix3.png "Heatwave: Drilldown to specific data")
One can then drill down further into for example a SimpleResultsTable in order to view the 
raw event information. 

The above visualization and flow provides you with a superior way of visualizing metrics 
compared to more standard metrics such as mean, min, max, and standard deviation. 

### SplunkGit
The following example visualizes the number of commit for a set of git-repositories.

![Splunkgit 1](https://raw.github.com/splunk/splunk-heatwave-viz/develop/examples/sg1.png "Heatwave: All commits to all git-repos during all-time")
The above image shows how you could visualize a set of git repositories and the number of commits
that have been made to them over a period of time. In this case all-time. The FlashTimeline 
illustrates the volume of commits over time, while the heatwave illustrates the intensity of
commits per repository over time.

![Splunkgit 2](https://raw.github.com/splunk/splunk-heatwave-viz/develop/examples/sg2.png "Heatwave: Specify a time in FlashTimeline")
Here we see how the FlashTimeline can be used to specify a set timeframe for the data to be
pushed down to the Heatwave.

![Splunkgit 3](https://raw.github.com/splunk/splunk-heatwave-viz/develop/examples/sg3.png "Heatwave: Drilldown on a specific time for all git-repos")
After the timespan has been pushed down the Heatwave visualizes the data.

![Splunkgit 4](https://raw.github.com/splunk/splunk-heatwave-viz/develop/examples/sg4.png "HeatwaveL Drilldown on a specific git-repo")
We can also drill down further to view the meta data of the buckets.

### HadoopOps
![HadoopOps](https://raw.github.com/splunk/splunk-heatwave-viz/develop/examples/hadoopOps1.png "Heatwave: Dashboard four heatwaves visualizing different metrics")
Here you can see how one easily can visualize different metrics in a hadoop cluster before, 
during, and after a job is run. The dashboard in the top left visualizes the CPU load for all 
nodes. The Heatwave in the top right visualizes the memory load. The Heatwave in the bottom left
visualizes disk usage, and the Heatwave in the bottom right is a visualization of I/O over all 
the nodes. 

From these four Heatwave tiles we can notice a couple of different trends. For example when the 
job starts and ends, which nodes have overloaded and underloaded disk usage, as well as a I/O 
anomaly. 

