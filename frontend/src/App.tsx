import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import AuthPage from "./pages/AuthPage";
import RegisterPage from "./pages/RegisterPage";
import { VotingApp } from "./pages/VotingApp";
import MyNFTsPage from "./pages/MyNFTsPage";
import "./App.css";

export default function App() {
  return (
    <Router>
      <Routes>
        {/* 기본 경로는 AuthPage로 리다이렉트 */}
        <Route path="/" element={<Navigate to="/auth" replace />} />

        {/* 1단계: 본인인증 페이지 (이름 입력 + 지갑 연결) */}
        <Route path="/auth" element={<AuthPage />} />

        {/* 2단계: SBT 발급 페이지 */}
        <Route path="/register" element={<RegisterPage />} />

        {/* 3단계: 투표 페이지 (SBT 보유자만 접근 가능) */}
        <Route path="/voting" element={<VotingApp />} />

        {/* NFT 컬렉션 페이지 */}
        <Route path="/my-nfts" element={<MyNFTsPage />} />

        {/* 알 수 없는 경로는 AuthPage로 리다이렉트 */}
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    </Router>
  );
}