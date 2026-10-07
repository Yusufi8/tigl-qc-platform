// Queue processors are introduced with the first asynchronous report workflow.
// Keep a separately deployable health process until a durable queue is configured.
import { setInterval } from 'node:timers';
console.log('TIGL QC worker ready; no processors are enabled in Phase 1 foundation.');
setInterval(()=>{},60_000);
