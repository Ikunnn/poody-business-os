# UI/UX Design System — AI Business OS

## Vision
"Tim bisnis AI yang terlihat seperti Bloomberg Terminal + Linear, tapi bahasa UMKM."

## Tokens
- Colors: bg #0B0F1A, card #12182A, line #1E2742, text #E6E9F5, muted #9AA4C0, accent #6C7BFF, ok #16C98D, warn #F5A623, crit #FF4D6D
- Typography: Inter 12/14/16/20/28, weight 500/600/700
- Radius: 12 / 14 / 999, shadow soft
- Spacing: 8pt grid

## Components
- KPI Card (value + delta + sparkline)
- Health Gauge (circular 0-100, 4 breakdown bars)
- Insight Card (icon left, confidence badge, source)
- Task Card (agent avatar, priority dot, confidence, approval btn)
- Agent Bubble (CEO hub-and-spoke, delegated chip)
- Table P&L, Calendar Grid

## Navigation (Sidebar PRD)
Dashboard | AI CEO (Chat) | Workflows | Finance | Marketing | Strategy | Tasks | Reports | Memory | Integrations | Settings

## Flows
1. Owner login -> Onboarding -> Dashboard -> "Naikkan profit 20%" -> CEO DAG -> Approval -> Execution -> Monitoring
2. Chat "Kenapa profit turun?" -> CEO delegasi -> Finance+Marketing+Data -> Synthesis -> 3 rekomendasi
3. Create Campaign -> Finance validasi budget -> Copywriter -> Social Calendar -> Approval -> Launch -> ROAS monitor

## States
idle / planning / working / waiting / reviewing / awaiting_approval / completed / failed
Empty: "Belum ada data, hubungkan Sheets/GA4" + CTA Connect
