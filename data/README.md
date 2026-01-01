# Quiz data format

The quiz spreadsheets under `data/` must follow these rules so that `npm run build:quizzes` can convert them into JSON:

- Supported files: `data/core/quiz_core.xlsx`, `data/aggregation/quiz_aggregation.xlsx`, `data/paths/quiz_paths.xlsx`, `data/modeling/quiz_modeling.xlsx`.
- Sheet headers (first row) are fixed: `question_id`, `track`, `type`, `instruction`, `hint`, `option_text`, `option_img`, `correct_answer`, `distractors`, `code_context`.
- `track` values must be one of **Core**, **Aggregation**, **Paths**, **Modeling** (case-insensitive). They are normalized to lowercase for the output file that matches the track.
- `type` currently supports `mcq` and `build`. Any other value causes the build to fail.
- `option_text` uses `|` as a separator to produce multiple options. Trimming is applied to each entry. For `build` questions, the final answer must be composable by concatenating these tokens (spacing and commas are ignored during validation).
- `option_img` also uses `|` with the same number of entries as `option_text`. Leave the cell empty to use empty strings for every option image. A different count results in a build error.
- `distractors` uses `|` as a separator. Empty cells become an empty array. Every distractor must match one of the options.
- Required cells: `question_id`, `track`, `type`, `instruction`, `correct_answer`. Empty or missing values will stop the build.
- `correct_answer`: For `mcq` questions, this must match one of the options from `option_text`. For `build` questions, it represents the complete answer string to be composed from the options.
- `question_id` values must be unique across all tracks.

Running `npm run build:quizzes` will output JSON files under `public/quizzes/`, sorted by question id per track. Any validation failure will terminate the build.
