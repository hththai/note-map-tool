# 07: AI picks the chart type; the app lays it out

**What to build:** The AI suggests a chart type (swimlane, flowchart, waterfall or entity) with a one-line reason, along with the steps, arrows and notes. The app, not the AI, computes positions for that chart type. The preview has an override dropdown that re-arranges instantly with no second AI call. The result stays fully editable.

**Blocked by:** 02: Entity box, pill, diamond and notes; 06: Generate a swimlane Flow from a brief

**Status:** done on branch `feat/ai-flows`

Chart types: swimlane (lanes per Team), flowchart (one column, no lanes), waterfall (stages in a staircase, each starting when the previous ends; not the financial bar chart), entity (boxes and relationships). Anything else falls back to the closest of the four, and the reason says so.

- [x] Preview shows the chosen chart type and the reason
- [x] Override dropdown re-arranges the preview without calling the AI
- [x] Layout for flowchart, waterfall and entity is computed by the app and has no overlapping boxes
- [x] Accepted result is ordinary steps and shapes the user can drag, retype and delete
