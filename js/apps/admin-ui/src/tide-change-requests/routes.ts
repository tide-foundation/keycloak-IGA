<<<<<<< HEAD
/** TIDECLOAK IMPLEMENTATION */
=======
/** TIDE IMPLEMENTATION */
>>>>>>> origin/release/0.13.26

import type { AppRouteObject } from "../routes";
import { ChangeRequestsRoute, ChangeRequestsRouteWithTab } from "./routes/ChangeRequests";


const routes: AppRouteObject[] = [
  ChangeRequestsRoute,
  ChangeRequestsRouteWithTab
];

export default routes;
