import type { RouteDef } from './router';
import { h } from 'preact';
import { FinishRound, HoleEntry, RoundSummary, StartRound, TheTurn } from '../ui/entry';
import { RoundDetail, RoundList } from '../ui/log';

/** Product features register their views here in dependency order. */
export const routes: RouteDef[] = [
  { path: '/round/start', view: StartRound },
  { path: '/round/hole/:n', view: ({ params }) => h(HoleEntry, { params: { n: params.n ?? '' } }) },
  { path: '/round/turn', view: TheTurn },
  { path: '/round/finish', view: FinishRound },
  { path: '/round/:id/summary', view: ({ params }) => h(RoundSummary, { params: { id: params.id ?? '' } }) },
  { path: '/log', view: RoundList },
  { path: '/log/:id', view: ({ params }) => h(RoundDetail, { params: { id: params.id ?? '' } }) },
];
