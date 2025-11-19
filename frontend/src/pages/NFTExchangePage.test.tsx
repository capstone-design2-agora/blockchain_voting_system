import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import NFTExchangePage from "./NFTExchangePage";
import { ToastProvider } from "../components/ToastProvider";
import useEmailVerificationStore from "../stores/emailVerificationStore";
import useNFTTradingStore from "../stores/nftTradingStore";
import { checkHasSBT } from "../lib/sbt";

jest.mock("lucide-react", () => {
  const React = require("react");
  const MockIcon = (props: any) => React.createElement("svg", props);
  return new Proxy({}, {
    get: () => MockIcon,
  });
});


jest.mock("../lib/sbt");

const mockNavigate = jest.fn();
jest.mock("react-router", () => {
  const actual = jest.requireActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockedCheckHasSBT = checkHasSBT as jest.MockedFunction<typeof checkHasSBT>;

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <NFTExchangePage />
      </ToastProvider>
    </MemoryRouter>
  );
}

function setWallet(address: string | null) {
  const state = useEmailVerificationStore.getState();
  useEmailVerificationStore.setState({ ...state, walletAddress: address });
}

function resetTradingStore() {
  useNFTTradingStore.getState().reset();
}

beforeEach(() => {
  jest.clearAllMocks();
  (window as any).ethereum = {
    request: jest.fn().mockResolvedValue([]),
  };
  resetTradingStore();
  setWallet(null);
});

describe("NFTExchangePage", () => {
  test("renders tabs after access check succeeds and supports tab switching", async () => {
    mockedCheckHasSBT.mockResolvedValue(true);
    setWallet("0x123");

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("커뮤니티 NFT 거래소")).toBeInTheDocument();
    });

    const proposalsTab = screen.getByRole("button", { name: "받은 제안" });
    await userEvent.click(proposalsTab);

    expect(screen.getByText(/받은 제안 준비중/)).toBeInTheDocument();

    const marketTab = screen.getByRole("button", { name: "마켓" });
    await userEvent.click(marketTab);
    expect(screen.getByText(/마켓 준비중/)).toBeInTheDocument();
  });

  test("redirects to email verification when SBT is missing", async () => {
    mockedCheckHasSBT.mockResolvedValue(false);
    setWallet("0x123");

    renderPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/email-verification", { replace: true });
    });
  });
});
