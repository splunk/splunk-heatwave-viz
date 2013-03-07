class SplunkBucketHeaderParser():
    def __init__(self, headerLine):
        self.fields = [[], [], []]
        self.__parseAll__(headerLine)

    def getFieldsBefore(self):
        return self.fields[0]

    def getBucketFields(self):
        return self.fields[1]

    def getFieldsAfter(self):
        return self.fields[2]

    def __parseAll__(self, headerLine):
        for bucket in headerLine:
            if "-" in bucket:
                self.fields[1].append(bucket)
            elif len(self.fields[1]) > 0:
                self.fields[2].append(bucket)
            else:
                self.fields[0].append(bucket)


class Thresholdify():
    def __init__(self, splunkHeader, threshold):
        self.splunkHeader = splunkHeader
        self.threshold = threshold
        self.minBuckets = self.minBucketsToMerge()
        self.maxBuckets = self.maxBucketsToMerge()

        self.threshold = self.roundThreshold(threshold, self.getBucketsNotToMerge())

    def roundThreshold(self, threshold, buckets):
        minThreshold = int(buckets[0].split("-")[0]) if (threshold.min > int(buckets[0].split("-")[0])) else threshold.min
        maxThreshold = int(buckets[-1].split("-")[1]) if (threshold.max < int(buckets[-1].split("-")[1])) else threshold.max

        return Threshold(minThreshold, maxThreshold)

    def minBucketsToMerge(self):
        result = 0
        for bucket in self.splunkHeader.getBucketFields():
            upperLimit = bucket.split('-')[1]
            if int(upperLimit) <= self.threshold.min:
                result += 1

        return result


    def maxBucketsToMerge(self):
        result = 0
        for bucket in self.splunkHeader.getBucketFields():
            lowerLimit = bucket.split('-')[0]
            if int(lowerLimit) >= self.threshold.max:
                result += 1

        return result

    def getBucketsNotToMerge(self):
        return self.splunkHeader.getBucketFields()[
               self.minBuckets:(len(self.splunkHeader.getBucketFields()) - self.maxBuckets)]

    def createHeaderWithThreshold(self):

        result = []

        for before in self.splunkHeader.getFieldsBefore():
            result.append(before)

        result.append("-inf - " + str(self.threshold.min))

        bucketsNotToMerge = self.getBucketsNotToMerge()

        for bucket in bucketsNotToMerge:
            result.append(bucket)

        result.append(str(self.threshold.max) + " - inf")

        for after in self.splunkHeader.getFieldsAfter():
            result.append(after)

        return result


    def mergeBuckets(self, bucketsToMerge):
        result = 0
        for bucket in bucketsToMerge:
            result += int(bucket)
        return result

    def getMergedFields(self, bucketFields):
        result = []
        minMerge = self.mergeBuckets(bucketFields[0:self.minBuckets])
        maxMerge = self.mergeBuckets(bucketFields[(len(bucketFields) - self.maxBuckets):])

        result.append(minMerge)
        for bucket in bucketFields[self.minBuckets:(len(bucketFields) - self.maxBuckets)]:
            result.append(bucket)

        result.append(maxMerge)

        return result

    def parseDataLine(self, line):
        result = []

        fieldsBefore = line[0:len(self.splunkHeader.getFieldsBefore())]
        bucketFields = line[
                       len(self.splunkHeader.getFieldsBefore()):(len(line) - len(self.splunkHeader.getFieldsAfter()))]
        fieldsAfter = line[(len(line) - len(self.splunkHeader.getFieldsAfter())):]

        mergedFields = self.getMergedFields(bucketFields)

        for before in fieldsBefore:
            result.append(before)

        for bucket in mergedFields:
            result.append(int(bucket))

        for after in fieldsAfter:
            result.append(after)

        return result


class Threshold():
    def __init__(self, min, max):
        self.min = min
        self.max = max


def main():
    import csv
    import sys


    (keywords, argvals) = splunk.Intersplunk.getKeywordsAndOptions()

    threshold_min = int(argvals.get("min", 100000))
    threshold_max = int(argvals.get("max", 220000))

    csv_reader = csv.reader(sys.stdin)

    output = []

    thresholdify = None

    for line in csv_reader:

        ## Create header
        if thresholdify is None:
            parser = SplunkBucketHeaderParser(line)
            threshold = Threshold(threshold_min, threshold_max)

            thresholdify = Thresholdify(parser, threshold)

            headers = thresholdify.createHeaderWithThreshold()
            output.append(headers)
        else:
        ## Create bucket values
            newLine = []
            for column in thresholdify.parseDataLine(line):
                newLine.append(column)
            output.append(newLine)

    ## Print everything back to Splunk
    for line in output:
        print ",".join(str(v) for v in line)


## I do this so I can run the unit tests
try:
    import splunk.Intersplunk

    main()
except:
    pass