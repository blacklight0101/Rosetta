import { createContext } from 'preact';
import type { ApprovedView } from '../lib/live-run/approved-line.js';

// RF-1003, RF-434 (P8-24): the approved amount of the journey the run belongs to, for the panels of
// the run page; undefined for a run outside a journey, which keeps showing its run cap.

export const ApprovedViewContext = createContext<ApprovedView | undefined>(undefined);
