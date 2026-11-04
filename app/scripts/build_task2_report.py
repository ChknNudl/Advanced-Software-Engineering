"""Rebuild the two-page report with Python + reportlab: python scripts/build_task2_report.py."""
from pathlib import Path
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

root = Path(__file__).resolve().parents[1]
out = root / 'output/pdf/marksync-task2-report.pdf'
out.parent.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='ReportTitle', fontName='Helvetica-Bold', fontSize=21, leading=25, spaceAfter=12, textColor=colors.HexColor('#163451')))
styles.add(ParagraphStyle(name='ReportHeading', fontName='Helvetica-Bold', fontSize=11, leading=14, spaceBefore=10, spaceAfter=5, textColor=colors.HexColor('#19568c'), keepWithNext=True))
styles.add(ParagraphStyle(name='ReportBody', fontName='Helvetica', fontSize=9.7, leading=13.5, spaceAfter=7))
styles.add(ParagraphStyle(name='ReportSmall', fontName='Helvetica', fontSize=8.4, leading=11.4, spaceAfter=6, textColor=colors.HexColor('#536579')))
story=[]
def text(s): story.append(Paragraph(s, styles['ReportBody']))
def heading(s): story.append(Paragraph(s, styles['ReportHeading']))
story.append(Paragraph('MarkSync | Task 2', styles['ReportTitle']))
story.append(Paragraph('Chaos testing strategy and AI engineering log<br/>Advanced Software Engineering | 4 November 2026', styles['ReportSmall']))
heading('1. System under test and correctness contract')
text('MarkSync uses Yjs text replicas over authenticated WebSockets, with SQLite storing both raw Markdown and encoded CRDT state. Three editors and one read-only observer use the same Replica class as the browser and connect to the production HTTP/WebSocket application. Yjs resolves concurrent text operations; the application supplies delivery, access control, persistence and recovery. Named cursor/selection presence uses relative positions and is deliberately transient.')
text('<b>Property:</b> once editing stops and communication becomes reliable, every authorised replica must converge on exactly the same text and operation frontier, matching the persisted server state. The reference Y.Doc receives each generated edit before network loss, so equal-but-incomplete clients cannot pass by merely copying an incomplete server result. Local edit operations are also checked against ordinary string operations. This verifies transport and preservation under Yjs semantics, not an independently reimplemented proof of Yjs.')
heading('2. Fault model, generation and recovery')
text('fast-check generates 8-35 Unicode insert/delete/replace operations per scenario across three editors, plus two coverage probes. Character data includes ASCII, whitespace, accented text, Chinese and emoji. Edits remain concurrent because replicas can work before receiving one another\'s updates. One editor restores its queued state halfway through, exercising tab-refresh recovery.')
text('A seeded virtual-time queue intercepts real application messages before send and after receipt. It injects 1-12 tick delays, approximately 23% random loss and 20% duplication, with due-time ordering allowing later operations to arrive first. Explicit probes discard the first upstream update, allow another to reach the server, and discard a downstream sync and acknowledgement. Every property case asserts that both loss directions, acknowledgement loss and delay occurred. A separate scenario verifies actual duplication and reordering.')
text('At quiescence, faults stop and delayed messages drain. Clients retry pending batches and request missing Yjs state through ordinary resync messages; three reliable repair rounds must converge and clear pending queues. The harness never installs the oracle into a client. The browser invokes the same repair-message method every three seconds, including on an open socket. Test-only fixed replica IDs and per-receiver processing barriers make seeded schedules replayable; ping/pong barriers transfer no document state.')
heading('3. Reproduction, CI and scope')
text('From <b>app/</b>: <b>pnpm install --frozen-lockfile</b>, then <b>pnpm test:chaos</b> (Windows: pnpm.cmd). Set <b>CHAOS_SEED</b> and optionally <b>CHAOS_RUNS</b>; use the <b>CHAOS_PATH</b> printed by fast-check to replay a shrunk failure. Default: 100 scenarios. CI runs seeds 20261104 and 11042026 with 100 scenarios each inside the <b>checks</b> job. A failure fails that job. The repository owner must require this status check before merging; workflow configuration alone is not enforcement.')
text('This is bounded evidence, not a mathematical proof or load benchmark. Recovery assumes eventual delivery, valid permissions and configured size limits. Permanent partitions, revoked access, total browser-storage loss, server crash atomicity and multi-server scaling are outside these claims. Overlapping edits may converge to text requiring human revision. The independent reference uses Yjs too, so a shared library bug is a remaining limitation.')
story.append(PageBreak())
story.append(Paragraph('AI engineering & debugging log', styles['ReportTitle']))
story.append(Paragraph('Actual findings from AI-assisted implementation and test execution; formal group review is a separate step.', styles['ReportSmall']))
heading('Instance 1 | A live connection could remain permanently out of sync')
text('<b>Generated approach:</b> earlier preparation retried pending operations on typing or reconnect and fetched missing state on join. Its generated merge test eventually delivered the store\'s final state directly to clients. That could validate CRDT merging while concealing a delivery-protocol gap.')
text('<b>Problem and observed evidence:</b> losing the final outgoing edit, a remote delta or an acknowledgement without closing the socket left no new event to trigger recovery. The new real-WebSocket regression initially failed with <b>"valid recovery messages must be accepted"</b> and repeated <b>"Invalid event or document."</b> responses: the server had no resync endpoint. A working CRDT did not make the application recover missing messages.')
text('<b>Resolution:</b> added authenticated, rate/size-bounded state-vector resync and periodic pending-update retry, with recovery requests shared between the UI and tests. A lost first response also retries join. The test now repairs only through the real protocol. A negative control disables repair and must detect a lost edit; it cannot pass by converging all clients to an incomplete server snapshot. Two browser sessions with their first outgoing edits deliberately dropped also recovered automatically and showed named cursors.')
text('<b>Critical evaluation:</b> the earlier test was useful for merging and serialisation, but insufficient evidence for distributed recovery. Claims must distinguish the library\'s merge rules from the application\'s delivery guarantees. Directly forcing a final state is not a substitute for exercising the recovery path.')
heading('Instance 2 | A loss test did not actually exercise downstream loss')
text('<b>Generated approach:</b> the first new regression sent two edits through a seeded random-drop channel and asserted that both upstream and downstream messages had been lost.')
text('<b>Problem and observed evidence:</b> after resync was implemented, seed 42 failed at <b>assert(n.metrics.droppedDown &gt; 0)</b>. Both outgoing edits could disappear before the server broadcast anything, so there was no downstream message to drop. Meanwhile, a 25-scenario property run passed. A green result and a probability setting did not establish the intended fault coverage.')
text('<b>Resolution:</b> added explicit coverage probes and measured loss counters, including acknowledgement loss. Retained random latency, loss, duplication and operation ordering around the probes. Added a scenario requiring reordering/duplication and a replay test comparing final text plus fault metrics across two identical runs. Broadcast barriers and test-only fixed Yjs IDs remove incidental scheduling/identity variation from the seeded experiment.')
text('<b>Critical evaluation:</b> tests must demonstrate the fault they claim to simulate. The protected probe is disclosed rather than calling the channel uniformly random. Negative controls and fault counters make superficial tests easier to reject. No fabricated peer feedback or invented AI research conversation is used as evidence.')
heading('Evidence and handover')
text('Sources: <b>test/chaos/network.ts</b>, <b>test/chaos/sync.chaos.ts</b>, <b>public/collaboration.js</b>, <b>src/presence.ts</b>; detailed log: <b>docs/TASK2-AI-LOG.md</b>. Existing tests additionally cover permissions, real-socket presence/cursors, persistence, duplicate delivery and personal undo. Read <b>docs/TASK2.md</b> for assumptions, demonstration and requirement mapping.')
story.append(Paragraph('Submission: after peer review and passing remote CI, merge the PR, tag the final main commit, then email the tag, this report and the merged PR URL. This report does not assert that review, merge, tagging or email submission has happened.', styles['ReportSmall']))
def footer(canvas, doc):
    canvas.setStrokeColor(colors.HexColor('#d8e2ec'));canvas.line(43,40,552,40)
    canvas.setFillColor(colors.HexColor('#536579'));canvas.setFont('Helvetica',8)
    canvas.drawString(43,27,'MarkSync | Task 2 | Strategy and genuine debugging evidence')
    canvas.drawRightString(552,27,f'{doc.page} / 2')
SimpleDocTemplate(str(out), pagesize=(595.28,841.89), leftMargin=43,rightMargin=43,topMargin=36,bottomMargin=52,title='MarkSync Task 2 - Chaos testing and AI debugging log').build(story,onFirstPage=footer,onLaterPages=footer)
print(out)
