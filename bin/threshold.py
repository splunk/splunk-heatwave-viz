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
        self.discard_min = False
        self.discard_max = False

    def roundThreshold(self, threshold, buckets):
        minThreshold = int_or_float(buckets[0].split("-")[0]) if (
            threshold.min > int_or_float(buckets[0].split("-")[0])) else threshold.min
        maxThreshold = int_or_float(buckets[-1].split("-")[1]) if (
            threshold.max < int_or_float(buckets[-1].split("-")[1])) else threshold.max

        return Threshold(minThreshold, maxThreshold)

    def minBucketsToMerge(self):
        result = 0
        for bucket in self.splunkHeader.getBucketFields():
            upperLimit = bucket.split('-')[1]
            if int_or_float(upperLimit) <= self.threshold.min:
                result += 1

        return result

    def setDiscardMin(self, value):
        self.discard_min = value

    def setDiscardMax(self, value):
        self.discard_max = value

    def maxBucketsToMerge(self):
        result = 0
        for bucket in self.splunkHeader.getBucketFields():
            lowerLimit = bucket.split('-')[0]
            if int_or_float(lowerLimit) >= self.threshold.max:
                result += 1

        return result

    def getBucketsNotToMerge(self):
        return self.splunkHeader.getBucketFields()[
               self.minBuckets:(len(self.splunkHeader.getBucketFields()) - self.maxBuckets)]

    def createHeaderWithThreshold(self):

        result = []

        result.extend(self.splunkHeader.getFieldsBefore())

        if not self.discard_min:
            result.append("<" + str(self.threshold.min))

        result.extend(self.getBucketsNotToMerge())

        if not self.discard_max:
            result.append(">" + str(self.threshold.max))

        result.extend(self.splunkHeader.getFieldsAfter())

        return result

    def mergeBuckets(self, bucketsToMerge):
        result = 0
        for bucket in bucketsToMerge:
            result += int_or_float(bucket)
        return result

    def getMergedFields(self, bucketFields):
        result = []
        minMerge = self.mergeBuckets(bucketFields[0:self.minBuckets])
        maxMerge = self.mergeBuckets(bucketFields[(len(bucketFields) - self.maxBuckets):])

        if not self.discard_min:
            result.append(minMerge)

        for bucket in bucketFields[self.minBuckets:(len(bucketFields) - self.maxBuckets)]:
            result.append(int_or_float(bucket))

        if not self.discard_max:
            result.append(maxMerge)

        return result

    def getBeforeFieldsFromLine(self, line):
        return line[0:len(self.splunkHeader.getFieldsBefore())]

    def getBucketFieldsFromLine(self, line):
        return line[len(self.splunkHeader.getFieldsBefore()):(len(line) - len(self.splunkHeader.getFieldsAfter()))]

    def getAfterFieldsFromLine(self, line):
        return line[(len(line) - len(self.splunkHeader.getFieldsAfter())):]


    def parseDataLine(self, line):

        result = []

        result.extend(self.getBeforeFieldsFromLine(line))

        result.extend(self.getMergedFields(self.getBucketFieldsFromLine(line)))

        result.extend(self.getAfterFieldsFromLine(line))

        return result


class Threshold():
    def __init__(self, min, max):
        self.min = min
        self.max = max


def int_or_float(x):
    try:
        return int(x)
    except ValueError:
        return float(x)


def main():
    import csv
    import sys


    (keywords, argvals) = splunk.Intersplunk.getKeywordsAndOptions()

    threshold_min = int_or_float(argvals.get("min", 100000))
    threshold_max = int_or_float(argvals.get("max", 220000))
    discard_min = bool(argvals.get("discard_min", False))
    discard_max = bool(argvals.get("discard_max", False))

    csv_reader = csv.reader(sys.stdin)

    output = []

    thresholdify = None

    for line in csv_reader:

        ## Create header
        if thresholdify is None:
            parser = SplunkBucketHeaderParser(line)
            threshold = Threshold(threshold_min, threshold_max)

            thresholdify = Thresholdify(parser, threshold)
            thresholdify.setDiscardMin(discard_min)
            thresholdify.setDiscardMax(discard_max)

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




############ UNIT TESTS ###############
import unittest


class TestSplunkHeaderParser(unittest.TestCase):
    header = ["_time", "0-1", "1-2", "2-3", "3-4", "_span"]

    parser = SplunkBucketHeaderParser(header)

    def test_getFieldsBefore_returnsTimeField(self):
        self.assertEqual(self.parser.getFieldsBefore(), ["_time"])

    def test_getFieldsAfter_returnSpanField(self):
        self.assertEqual(self.parser.getFieldsAfter(), ["_span"])

    def test_getBucketFields_returnBucketFields(self):
        self.assertEqual(self.parser.getBucketFields(), ["0-1", "1-2", "2-3", "3-4"])


class TestThresholdifyFunctions(unittest.TestCase):
    header = ["_time", "0-1", "1-2", "2-3", "3-4", "_span"]
    data = [["00:00:00", "5", "2", "3", "2", "100"],
            ["00:00:01", "1", "3", "3", "2", "100"],
            ["00:00:02", "0", "3", "1", "0", "100"]]

    thresholdifier = Thresholdify(SplunkBucketHeaderParser(header), Threshold(2, 3))


    def test_minBucketsToMerge_returnsNumberOfBucketsThatHaveToBeMerged(self):
        self.assertEqual(self.thresholdifier.minBucketsToMerge(), 2)

    def test_maxBucketsToMerge_returnsNumberOfBucketsThatHaveToBeMerged(self):
        self.assertEqual(self.thresholdifier.maxBucketsToMerge(), 1)

    def test_createNewHeader_returnsHeaderWithThresholdBuckets(self):
        newHeader = self.thresholdifier.createHeaderWithThreshold()
        self.assertEqual(newHeader, ["_time", "<2", "2-3", ">3", "_span"])

    def test_createNewHeaderWithFloats_returnsHeaderWithFloatThresholdBuckets(self):
        header = ["_time", "0.0-10.0", "10.0-20.0", "20.0-30.0", "30.0-40.0", "_span"]

        thresholdifierWithDiscardMin = Thresholdify(SplunkBucketHeaderParser(header), Threshold(15.0, 30.0))

        self.assertEqual(thresholdifierWithDiscardMin.createHeaderWithThreshold(),
                         ["_time", "<10.0", "10.0-20.0", "20.0-30.0", ">30.0", "_span"])

    def test_createNewHeaderWithMinDiscard_returnsHeaderWithThresholdBuckets(self):
        thresholdifierWithDiscardMin = Thresholdify(SplunkBucketHeaderParser(self.header), Threshold(2, 3))
        thresholdifierWithDiscardMin.setDiscardMin(True)

        self.assertEqual(thresholdifierWithDiscardMin.createHeaderWithThreshold(), ["_time", "2-3", ">3", "_span"])

    def test_createNewHeaderWithMaxDiscard_returnsHeaderWithThresholdBuckets(self):
        thresholdifierWithDiscardMax = Thresholdify(SplunkBucketHeaderParser(self.header), Threshold(2, 3))
        thresholdifierWithDiscardMax.setDiscardMax(True)

        self.assertEqual(thresholdifierWithDiscardMax.createHeaderWithThreshold(), ["_time", "<2", "2-3", "_span"])

    def test_createBucketValues_returnsCorrectBucketLine(self):
        bucketLine = self.thresholdifier.parseDataLine(self.data[0])

        self.assertEqual(bucketLine, ['00:00:00', 7, 3, 2, '100'])

    def test_createBucketValuesWithNonEvenSpan_returnsRoundedMinMax(self):
        header = ["_time", "0-10", "10-20", "20-30", "30-40", "_span"]
        thresholdifier = Thresholdify(SplunkBucketHeaderParser(header), Threshold(13, 28))

        self.assertEqual(thresholdifier.createHeaderWithThreshold(), ["_time", "<10", "10-20", "20-30", ">30", "_span"])

    def test_createBucketValuesWithDiscardMin_returnsWithoutMinThreshold(self):
        thresholdifierWithDiscardMin = Thresholdify(SplunkBucketHeaderParser(self.header), Threshold(2, 3))
        thresholdifierWithDiscardMin.setDiscardMin(True)

        bucketLine = thresholdifierWithDiscardMin.parseDataLine(self.data[0])

        self.assertEqual(bucketLine, ['00:00:00', 3, 2, '100'])

    def test_createBucketValuesWithDiscardMax_returnsWithoutMaxThreshold(self):
        thresholdifierWithDiscardMax = Thresholdify(SplunkBucketHeaderParser(self.header), Threshold(2, 3))
        thresholdifierWithDiscardMax.setDiscardMax(True)

        bucketLine = thresholdifierWithDiscardMax.parseDataLine(self.data[0])

        self.assertEqual(bucketLine, ['00:00:00', 7, 3, '100'])
