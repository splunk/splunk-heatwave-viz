import json
import logging
import os
import sys

import cherrypy
import splunk

from splunk.appserver.mrsparkle.lib import jsonresponse
import controllers.module as module

logger = logging.getLogger('splunk')

class Heatwave(module.ModuleHandler):

    def generateResults(self, **kwargs):
        output = {'results': [], 'fields': {}, 'span': None}
        sid = kwargs.get('sid')
        count = max(int(kwargs.get('count', 10000)), 0)
        entity_type = kwargs.get('entity_type', 'results_preview')

        extent = {}
        span = None

        job = splunk.search.getJob(sid)

        if entity_type.startswith('results_preview'):
            rs = job.results_preview
        else:
            rs = job.results

        # enumerate data set
        for idx, row in enumerate(rs):
            obj = {
                   'result': [], 
                   '_time': unicode(row['_time']),
                   '_span': int(unicode(row['_span']))
                  }
            if span is None:
                try:
                    span = int(unicode(row['_span']))
                except Exception, e:
                    logger.debug(e)
            for field in row:
                     
                if not field.startswith('_'):
                    try:
                        val = float(unicode(row[field]))
                        obj['result'].append(
                            [
                             unicode(field), 
                             val
                            ]
                        )
                        limits = extent.get(field)
                        if limits is None:
                            extent[field] = {'min': val, 'max': val}
                        else:
                            if val < limits['min']:
                                extent[field]['min'] = val
                            elif val > limits['max']:
                                extent[field]['max'] = val
                    except Exception, e:
                        logger.debug(e)
            output['results'].append(obj)

        output['fields'] = extent
        output['span'] = span
        return self.render_json(output)

    def render_json(self, response_data, set_mime='text/json'):
        cherrypy.response.headers['Content-Type'] = set_mime

        if isinstance(response_data, jsonresponse.JsonResponse):
            response = response_data.toJson().replace("</", "<\\/")
        else:
            response = json.dumps(response_data).replace("</", "<\\/")

        return ' ' * 256  + '\n' + response

