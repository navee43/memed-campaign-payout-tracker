import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { MAX_PAISE } from "../utils/money";

export const objectId = z.string().refine((v) => isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(v), "Invalid id");
export const idParams = z.object({ id: objectId });

export const paise = z.number().int("Amount must be a whole number of paise").min(0).max(MAX_PAISE);
export const positivePaise = paise.refine((v) => v > 0, "Amount must be greater than zero");

export const boolFromQuery = z.enum(["true", "false"]).transform((v) => v === "true");

export const isoDate = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
