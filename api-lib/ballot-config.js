import { z } from "zod";

const trimmedNonEmpty = z
  .string()
  .min(1)
  .transform((value) => value.trim())
  .refine((value) => value.length > 0, { message: "Value cannot be blank" });

function isParsableTimestamp(value) {
  if (/^\d+$/.test(value)) {
    return true;
  }
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed);
}

const timestampString = z
  .string()
  .min(1)
  .transform((value) => value.trim())
  .refine(isParsableTimestamp, { message: "Invalid timestamp format" });

export const BallotProposal = z.object({
  name: trimmedNonEmpty,
  pledges: z.array(trimmedNonEmpty).min(1)
});

export const BallotSchedule = z.object({
  opensAt: timestampString,
  closesAt: timestampString,
  announcesAt: timestampString
});

export const BallotConfigSchema = z
  .object({
    ballotId: trimmedNonEmpty,
    title: trimmedNonEmpty,
    description: trimmedNonEmpty,
    expectedVoters: z.number().int().positive(),
    schedule: BallotSchedule,
    proposals: z.array(BallotProposal).min(1),
    mascotCid: z.string().optional(),
    verifierAddress: z.string().optional()
  })
  .superRefine((config, ctx) => {
    const names = config.proposals.map((proposal) => proposal.name);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["proposals"],
        message: "Proposal names must be unique"
      });
    }
  });

export class BallotConfigError extends Error {
  constructor(message, issues) {
    super(message);
    this.issues = issues;
    this.name = "BallotConfigError";
  }
}
