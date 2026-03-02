# Comfort V1 Regression Report

- Time: 2026-03-02T12:54:27.069Z
- Result: FAIL

| Check | Result | Notes |
| --- | :---: | --- |
| ChatWindow mounted comfort shell and density class | PASS | ChatWindow main container uses comfort shell + density class. |
| GroupChatWindow mounted comfort shell and density class | PASS | GroupChatWindow main container uses comfort shell + density class. |
| ChatWindow splits AI/user reading columns | PASS | ChatWindow has separate AI and user width classes. |
| Group AI bubble reuses unified speech-bubble style system | PASS | Group assistant message uses style-{rpTextStyle} unified class path. |
| No group-only style branches for text styles | PASS | No scoped group-speech-bubble.style-* overrides found in GroupChatWindow.vue. |
| Token files imported in global stylesheet | PASS | style.css imports tokens + theme-tokens + decor-tokens. |
| Motion tier classes exist in chat windows | PASS | Single/group chat both expose off/soft/expressive motion classes. |
| Long-conversation fatigue softening exists | PASS | Fatigue class lowers animation intensity for long conversations. |
| Reduced-motion fallback exists | PASS | Prefers-reduced-motion disables decorative animation chain. |
| Default reading density is standard | PASS | storage default keeps readingDensity as standard. |
| Default motion level is soft | PASS | storage default keeps motionLevel as soft. |
| Readability audit report all pass | FAIL | comfort-v1-readability-report.md has no failing marks. |

## Manual Scenario Checklist

- [ ] 30 short messages: verify density and hierarchy comfort
- [ ] 800+ character long message: verify line-length and paragraph rhythm
- [ ] alternating group speakers: verify single/group style parity
- [ ] 5-minute continuous scrolling: verify motion fatigue and scrollbar stability

## Notes

- This report is structural regression + audit aggregation, not a replacement for visual QA.
