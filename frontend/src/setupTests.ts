// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

if (!(global as any).TextEncoder) {
  (global as any).TextEncoder = TextEncoder;
}

if (!(global as any).TextDecoder) {
  (global as any).TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;
}

if (!process.env.REACT_APP_CITIZEN_SBT_ADDRESS) {
  process.env.REACT_APP_CITIZEN_SBT_ADDRESS = "0xTEST_SBT";
}

if (!process.env.REACT_APP_VOTING_CONTRACT_ADDRESS) {
  process.env.REACT_APP_VOTING_CONTRACT_ADDRESS = "0xTEST_VOTING";
}

if (!process.env.REACT_APP_REWARD_NFT_ADDRESS) {
  process.env.REACT_APP_REWARD_NFT_ADDRESS = "0xTEST_REWARD";
}

if (!process.env.REACT_APP_VERIFIER_ADDRESS) {
  process.env.REACT_APP_VERIFIER_ADDRESS = "0xTEST_VERIFIER";
}

if (!process.env.REACT_APP_PROPOSAL_NAMES) {
  process.env.REACT_APP_PROPOSAL_NAMES = "테스트안건";
}

if (!process.env.REACT_APP_PROPOSAL_PLEDGES) {
  process.env.REACT_APP_PROPOSAL_PLEDGES = "테스트공약";
}

if (!process.env.REACT_APP_EXPLORER_TX_TEMPLATE) {
  process.env.REACT_APP_EXPLORER_TX_TEMPLATE = "https://explorer/tx/{hash}";
}

if (!process.env.REACT_APP_PUBLIC_RPC_URL) {
  process.env.REACT_APP_PUBLIC_RPC_URL = "http://localhost:9545";
}

if (!process.env.REACT_APP_EXPECTED_VOTERS) {
  process.env.REACT_APP_EXPECTED_VOTERS = "100";
}
