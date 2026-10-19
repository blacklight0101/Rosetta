import type { GetJourney } from '../../application/use-cases/get-journey.js';

// RF-615, RF-1105: GET /api/projects/:id/journey (registered by the feature commit).

export interface JourneyServices {
  readonly getJourney: Pick<GetJourney, 'execute'>;
}
