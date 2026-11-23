-- FAQ-10: the review queue shows ceil(10%) of the pass verdicts, chosen at random. Each verdict gets a
-- random rank once (when first read by the queue, or when the worker stores it), so the sample does not
-- change between requests; the sample is the lowest ranks.
ALTER TABLE constraint_verdicts ADD COLUMN sample_rank INTEGER;
