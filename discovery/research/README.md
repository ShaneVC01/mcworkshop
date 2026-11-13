---
type: doc
status: active
tags: [vehicle-library, research, ai-research, provenance]
relatedTo: [supabase-handover]
---

# Vehicle library research (12/11/2026)

Every model in the Supabase vehicle library was researched against public sources by AI agents with web search. The raw answers are kept here with their source links so any value can be checked.

## Files

- `result_01.json` to `result_13.json`: first pass, one file per batch of about 46 models, in make order.
- `p2_result_01.json` to `p2_result_07.json`: second pass, the 82 models with 5 or more vehicles that the first pass could not verify.
- `merge_research.py`: validates the files, compares them with the workshop's own records and builds the rows loaded into the database. It was run from a scratch folder that held `library_raw.json` (an export of the library) and the batch files.

## Each row

`id` (the library model id), `family`, `series`, `year_from`, `year_to`, `in_production`, `vehicle_class`, `fuel_type`, `engine`, `confidence`, `sources` and `notes`. Years are Australian new sale years.

## Rules used to load

- Only rows with high or medium confidence were loaded. Low confidence rows stay as they were and are not marked as researched.
- Loaded rows are marked `attributes_source = 'research'`. The history refresh never overwrites them and staff edits (`manual`) outrank them.
- Where research was silent on a field the earlier value stays.
- Where the workshop has seen vehicles outside the researched years, the range was widened to cover them and the notes say so.
- The notes on each model carry the confidence and the source links.

## Result

298 of 587 models loaded, covering 18,940 of the 20,056 customer vehicles. The rest have no researched values because the agents could not verify them. Their notes were not loaded.

## Known limits

- Several Australian news sites blocked the agents, so some facts came from search summaries. Those are flagged in the notes.
- The agents' web search quota was small, so a second pass covered only models with 5 or more vehicles.
- Engines are the main Australian engines and may not list every variant across a long model span.
- Research gives the range sold new in Australia. Grey imports and earlier nameplates are why some ranges were widened.
