import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AuthPage.css";

export default function AuthPage() {
    const navigate = useNavigate();
    const [name, setName] = useState("");
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            setError("이름을 입력해주세요.");
            return;
        }

        if (name.trim().length < 2) {
            setError("이름은 최소 2자 이상이어야 합니다.");
            return;
        }

        try {
            setIsVerifying(true);
            setError(null);

            // TODO: 여기에 나중에 실제 본인 확인 로직 추가
            // 예: 휴대폰 인증, 신분증 인증 등
            // 현재는 더미로 바로 넘김

            // 본인 확인 성공 시 Register 페이지로 이동
            navigate("/register", { state: { name } });
        } catch (error: any) {
            console.error("Error during verification:", error);
            setError(error.message || "본인 확인 중 오류가 발생했습니다.");
            setIsVerifying(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-container">
                <h1>🗳️ 블록체인 투표 시스템</h1>
                <p className="subtitle">SBT 기반 안전한 투표 시스템</p>

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label htmlFor="name">이름</label>
                        <input
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="홍길동"
                            disabled={isVerifying}
                            autoComplete="name"
                        />
                    </div>

                    {error && (
                        <div className="error-message">
                            <p>❌ {error}</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        className="connect-button"
                        disabled={isVerifying || !name.trim()}
                    >
                        {isVerifying ? "확인 중..." : "✅ 본인 확인"}
                    </button>
                </form>

                <div className="info-box">
                    <h3>ℹ️ 안내사항</h3>
                    <ul>
                        <li>본인 확인 후 지갑 연결이 필요합니다.</li>
                        <li>최초 1회 SBT(신원 토큰) 발급이 필요합니다.</li>
                        <li>SBT는 양도할 수 없으며 영구적으로 지갑에 바인딩됩니다.</li>
                        <li>1인 1투표가 보장됩니다.</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
