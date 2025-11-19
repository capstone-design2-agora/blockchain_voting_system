import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router";
import EmailVerificationPage from "./pages/EmailVerificationPage";
import { VotingApp } from "./pages/VotingApp";
import MyNFTsPage from "./pages/MyNFTsPage";
import NFTExchangePage from "./pages/NFTExchangePage";
import AdminDeployPage from "./pages/AdminDeployPage";
import { ToastProvider } from "./components/ToastProvider";
import "./App.css";
import { loadConfig } from "./lib/config";

export default function App() {
  const [configLoaded, setConfigLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfig()
      .then(() => setConfigLoaded(true))
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div style={{ padding: "20px", color: "red" }}>
        <h1>Configuration Error</h1>
        <p>{error}</p>
        <p>Please make sure config.json exists in the public directory.</p>
      </div>
    );
  }

  if (!configLoaded) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        Loading configuration...
      </div>
    );
  }

  return (
    <ToastProvider>
      <Router>
        <Routes>
          {/* 기본 경로는 이메일 인증 페이지로 리다이렉트 */}
          <Route path="/" element={<Navigate to="/email-verification" replace />} />

          {/* 2단계: 이메일 인증 기반 SBT 발급 (새 방식 - 기본) */}
          <Route path="/email-verification" element={<EmailVerificationPage />} />

          {/* 3단계: 투표 페이지 (SBT 보유자만 접근 가능) */}
          <Route path="/voting" element={<VotingApp />} />

          {/* NFT 컬렉션 페이지 */}
          <Route path="/my-nfts" element={<MyNFTsPage />} />

          {/* NFT 거래소 페이지 */}
          <Route path="/nft-exchange" element={<NFTExchangePage />} />

          <Route path="/admin/deploy" element={<AdminDeployPage />} />
          {/* 알 수 없는 경로는 이메일 인증 페이지로 리다이렉트 */}
          <Route path="*" element={<Navigate to="/email-verification" replace />} />
        </Routes>
      </Router>
    </ToastProvider>
  );
}
