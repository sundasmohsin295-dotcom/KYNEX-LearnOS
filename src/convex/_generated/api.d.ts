/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as achievementMeta from "../achievementMeta.js";
import type * as aiEngine from "../aiEngine.js";
import type * as aiSanitize from "../aiSanitize.js";
import type * as aiStatus from "../aiStatus.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as circuitBreaker from "../circuitBreaker.js";
import type * as examiner from "../examiner.js";
import type * as examinerReads from "../examinerReads.js";
import type * as gamification from "../gamification.js";
import type * as gpa from "../gpa.js";
import type * as gpaMath from "../gpaMath.js";
import type * as gradePath from "../gradePath.js";
import type * as http from "../http.js";
import type * as intel from "../intel.js";
import type * as intelligence from "../intelligence.js";
import type * as learning from "../learning.js";
import type * as materials from "../materials.js";
import type * as missionMath from "../missionMath.js";
import type * as missions from "../missions.js";
import type * as nudges from "../nudges.js";
import type * as planner from "../planner.js";
import type * as profiles from "../profiles.js";
import type * as readiness from "../readiness.js";
import type * as referrals from "../referrals.js";
import type * as security from "../security.js";
import type * as securityGet from "../securityGet.js";
import type * as smartSearch from "../smartSearch.js";
import type * as smartSearchQuery from "../smartSearchQuery.js";
import type * as telemetry from "../telemetry.js";
import type * as tutorScope from "../tutorScope.js";
import type * as users from "../users.js";
import type * as visuals from "../visuals.js";
import type * as weeklyReport from "../weeklyReport.js";
import type * as writer from "../writer.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  achievementMeta: typeof achievementMeta;
  aiEngine: typeof aiEngine;
  aiSanitize: typeof aiSanitize;
  aiStatus: typeof aiStatus;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  circuitBreaker: typeof circuitBreaker;
  examiner: typeof examiner;
  examinerReads: typeof examinerReads;
  gamification: typeof gamification;
  gpa: typeof gpa;
  gpaMath: typeof gpaMath;
  gradePath: typeof gradePath;
  http: typeof http;
  intel: typeof intel;
  intelligence: typeof intelligence;
  learning: typeof learning;
  materials: typeof materials;
  missionMath: typeof missionMath;
  missions: typeof missions;
  nudges: typeof nudges;
  planner: typeof planner;
  profiles: typeof profiles;
  readiness: typeof readiness;
  referrals: typeof referrals;
  security: typeof security;
  securityGet: typeof securityGet;
  smartSearch: typeof smartSearch;
  smartSearchQuery: typeof smartSearchQuery;
  telemetry: typeof telemetry;
  tutorScope: typeof tutorScope;
  users: typeof users;
  visuals: typeof visuals;
  weeklyReport: typeof weeklyReport;
  writer: typeof writer;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
