import { AsyncLocalStorage } from "node:async_hooks";
import { ORG_ID } from "@/lib/domain";
import type { Identity } from "@/lib/permissions";
export const requestIdentity = new AsyncLocalStorage<Identity>();
export const getOrgId = () => requestIdentity.getStore()?.orgId || ORG_ID;
