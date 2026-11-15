---------------------------- MODULE MarkSyncProtocol ----------------------------
(***************************************************************************)
(* Abstract model of MarkSync's Yjs message-passing protocol (Task 3).     *)
(* Operations are causal tokens <<client, clock>>; no text is modelled.    *)
(* Starting skeleton: only local edits so far. Add Join, SendPending,      *)
(* ServerReceive, ReceiveAck, ReceiveDelta, Resync, Disconnect and Drop    *)
(* one at a time, re-running TLC after each.                               *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Clients, MaxClock

Server == "server"
Nodes  == Clients \cup {Server}
Ops    == Clients \X (1..MaxClock)

VARIABLES clock, known, pending, connected, msgs
vars == <<clock, known, pending, connected, msgs>>

TypeOK ==
  /\ clock     \in [Clients -> 0..MaxClock]
  /\ known     \in [Nodes -> SUBSET Ops]
  /\ pending   \in [Clients -> SUBSET Ops]
  /\ connected \in [Clients -> BOOLEAN]

Init ==
  /\ clock     = [c \in Clients |-> 0]
  /\ known     = [n \in Nodes |-> {}]
  /\ pending   = [c \in Clients |-> {}]
  /\ connected = [c \in Clients |-> FALSE]
  /\ msgs      = {}

Edit(c) ==
  LET op == <<c, clock[c] + 1>> IN
  /\ clock[c] < MaxClock
  /\ clock'   = [clock   EXCEPT ![c] = @ + 1]
  /\ known'   = [known   EXCEPT ![c] = @ \cup {op}]
  /\ pending' = [pending EXCEPT ![c] = @ \cup {op}]
  /\ UNCHANGED <<connected, msgs>>

Next == \E c \in Clients : Edit(c)

Spec == Init /\ [][Next]_vars

Monotonicity == [][\A c \in Clients : clock'[c] >= clock[c]]_vars
=============================================================================
