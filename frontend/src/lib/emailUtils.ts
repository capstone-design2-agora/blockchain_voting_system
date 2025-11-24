/**
 * 이메일 유틸리티 함수
 * 이메일 정규화, 검증, 도메인 체크
 */

/**
 * 이메일 정규화 (소문자 변환, 공백 제거)
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * 이메일 형식 검증
 */
export function isEmailValid(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 이메일에서 도메인 추출
 */
export function extractDomain(email: string): string {
  return email.split('@')[1] || '';
}

/**
 * 도메인이 허용 목록에 있는지 확인
 * 와일드카드(*) 지원
 */
export function isDomainAllowed(email: string, allowlist: string[]): boolean {
  const domain = extractDomain(normalizeEmail(email));
  
  return allowlist.some(allowed => {
    if (allowed.startsWith('*')) {
      // 와일드카드: *.ac.kr → example.ac.kr 매칭
      return domain.endsWith(allowed.slice(1));
    }
    return domain === allowed;
  });
}

/**
 * 환경변수에서 허용된 도메인 목록 가져오기
 */
export function getAllowedDomains(): string[] {
  const domainList = process.env.REACT_APP_EMAIL_DOMAIN_ALLOWLIST || '';
  return domainList.split(',').map(d => d.trim()).filter(Boolean);
}

/**
 * 도메인 힌트 생성 (UI에서 사용)
 */
export function getDomainHint(email: string, allowedDomains: string[]): string | null {
  if (!email || email.indexOf('@') === -1) {
    return null;
  }

  // 이미 허용된 도메인이면 힌트 불필요
  if (isDomainAllowed(email, allowedDomains)) {
    return null;
  }
  
  // 첫 번째 허용 도메인 제안
  if (allowedDomains.length > 0) {
    const suggestion = allowedDomains[0].replace('*', 'example');
    return `허용된 도메인: ${suggestion}`;
  }
  
  return null;
}

/**
 * 이메일 마스킹 (개인정보 보호)
 * example@domain.com → ex***@domain.com
 */
export function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return email;
  
  const visibleChars = Math.min(2, localPart.length);
  const masked = localPart.substring(0, visibleChars) + '***';
  
  return `${masked}@${domain}`;
}
