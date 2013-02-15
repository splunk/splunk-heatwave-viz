import json
import logging
import os
import sys

import cherrypy
import controllers.module as module
import splunk
import splunk.search
import math
import splunk.util
import time
import lib.util as util
from splunk.appserver.mrsparkle.lib import jsonresponse

logger = logging.getLogger('splunk.appserver.controller.module.Heatwave')

class Heatwave(module.ModuleHandler):

    def generateResults(self, host_app, client_app, sid, count=1000, offset=0, entity_name='results'):	
	
	logger.info('I GOT TO THE PYTOHN FILE!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')	
	count = max(int(count), 0)
        offset = max(int(offset), 0)
        if not sid:
            raise Exception('BucketHeatMap.generateResults - sid not passed!')

        job = splunk.search.getJob(sid)
	#logger.info('job %s' % job)
        dataset = getattr(job, entity_name)[offset: offset+count]
	logger.info('dataset %s' % dataset)
        logger.info('dataset.results %s' % dataset.results)
        results=[]

	for i, result in enumerate(dataset):

		pillarData=[]
		pillarData  = str(result).split()
		logger.info('pillarData[0] %s' % pillarData[0])
		logger.info('pillarData[-1] %s' % pillarData[-1])
		#del pillarData[0]
		#del pillarData[-1]
		logger.info(pillarData)
		results.append(pillarData)

        dict = str(results).replace(" ","")
	logger.info(dict)
        return dict
