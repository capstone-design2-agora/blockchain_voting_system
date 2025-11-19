export interface BallotSchedule {
  opensAt: string; // ISO 8601 string
  closesAt: string;
  announcesAt: string;
}

export interface BallotProposal {
  name: string;
  pledges: string[];
}

export interface BallotConfig {
  ballotId: string;
  title: string;
  description: string;
  expectedVoters: number;
  schedule: BallotSchedule;
  proposals: BallotProposal[];
  mascotCid?: string;
  verifierAddress?: string;
}
