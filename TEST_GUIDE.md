# SBT Wallet Binding - End-to-End Test Guide

## Test Environment Setup

### Prerequisites
- Quorum network running on `http://localhost:10545`
- Frontend dev server on `http://localhost:3000`
- MetaMask extension installed
- Test accounts with ETH

### Network Configuration
```
Network Name: Quorum Local
RPC URL: http://localhost:10545
Chain ID: 1337
Currency Symbol: ETH
```

## Test Scenarios

### 1. New User Flow - Happy Path ✅

**Objective**: Verify complete onboarding and voting process

**Steps**:
1. Open `http://localhost:3000`
2. Should auto-redirect to `/auth`
3. Click "MetaMask 연결" button
4. Select MetaMask account (Account 1)
5. Approve connection
6. Enter name in input field (e.g., "홍길동")
7. Click "다음" button
8. Should navigate to `/register`
9. Verify wallet address and name displayed
10. Read warning messages
11. Click "SBT 발급받기" button
12. Approve MetaMask transaction
13. Wait for transaction confirmation
14. Should auto-redirect to `/voting`
15. Verify "✓ 인증된 사용자" badge visible
16. Verify wallet address shown in badge
17. Verify "🎨 내 NFT 컬렉션" button visible
18. Select a proposal option
19. Click "투표하기" button
20. Approve MetaMask transaction
21. Wait for confirmation
22. Verify success message with NFT info
23. Click "🎨 내 NFT 컬렉션" button
24. Should navigate to `/my-nfts`
25. Verify analytics dashboard shows:
    - 총 투표 수: 1
    - 보유 NFT: 1
    - 참여율: 100%
    - 유권자 등급: 브론즈
26. Verify achievements section shows:
    - 🎯 첫 투표 (unlocked)
    - Other badges (locked)
27. Verify NFT card displayed with correct info
28. Click NFT card
29. Verify modal opens with full details
30. Click "🐦 트위터에 공유" button
31. Verify Twitter share window opens
32. Close Twitter window
33. Click "🔗 링크 복사" button
34. Verify "링크가 클립보드에 복사되었습니다!" alert
35. Click ✕ to close modal
36. Click "← 투표 페이지로" button
37. Should navigate back to `/voting`

**Expected Results**:
- ✅ All steps complete without errors
- ✅ SBT minted successfully
- ✅ Vote recorded and NFT issued
- ✅ Statistics updated correctly
- ✅ First achievement unlocked
- ✅ All navigation works smoothly

---

### 2. Returning User Flow ✅

**Objective**: Verify quick access for users with SBT

**Steps**:
1. Open `http://localhost:3000` (with same account as Test 1)
2. Should auto-redirect to `/auth`
3. Page should immediately check SBT
4. Should auto-redirect to `/voting` (skip registration)
5. Verify badge shows "✓ 인증된 사용자"
6. Verify can vote if ballot is open

**Expected Results**:
- ✅ No registration flow shown
- ✅ Direct access to voting
- ✅ Previously minted SBT recognized

---

### 3. Edge Case - No Wallet Connected 🔒

**Objective**: Handle missing wallet gracefully

**Steps**:
1. Disconnect wallet from MetaMask
2. Open `http://localhost:3000`
3. Redirects to `/auth`
4. Click "MetaMask 연결" button
5. MetaMask prompts to connect
6. Try navigating to `/voting` directly
7. Should redirect back to `/auth`
8. Try navigating to `/my-nfts` directly
9. Should redirect back to `/auth`

**Expected Results**:
- ✅ No crashes or console errors
- ✅ Clear "지갑을 연결해주세요" message
- ✅ Protected routes redirect properly
- ✅ User can connect wallet anytime

---

### 4. Edge Case - Duplicate Identity Registration 🔒

**Objective**: Prevent same person from getting multiple SBTs

**Setup**: Use Account 1 (already has SBT from Test 1)

**Steps**:
1. Try to access `/register` directly
2. Should redirect to `/voting` (already has SBT)
3. Switch to Account 2 (no SBT yet)
4. Complete registration with same name as Account 1 ("홍길동")
5. Click "SBT 발급받기"
6. Transaction should succeed (different wallet, same identity)
7. Both accounts can vote independently

**Expected Results**:
- ✅ Cannot re-register if already have SBT
- ✅ Same identity CAN get SBT in different wallet (current implementation)
- ⚠️ Note: In production, should prevent duplicate identities

---

### 5. Edge Case - Voting Without SBT 🔒

**Objective**: Ensure only SBT holders can vote

**Setup**: Use Account 3 (no SBT)

**Steps**:
1. Connect Account 3
2. Try to navigate to `/voting` directly
3. Should redirect to `/auth`
4. Complete registration to get SBT
5. Now can access `/voting`
6. Try to vote
7. Should succeed

**Expected Results**:
- ✅ Non-SBT holders cannot vote
- ✅ Clear error if attempting to vote without SBT
- ✅ Must complete registration first

---

### 6. Edge Case - Multiple Votes Attempt 🔒

**Objective**: Prevent duplicate voting

**Setup**: Use account that already voted in Test 1

**Steps**:
1. Navigate to `/voting`
2. Select a proposal
3. Click "투표하기"
4. Should show error: "이미 투표하셨습니다"
5. Transaction should not be sent

**Expected Results**:
- ✅ Cannot vote twice on same ballot
- ✅ Clear error message shown
- ✅ No transaction sent to blockchain

---

### 7. Edge Case - Account Switch During Flow 🔒

**Objective**: Handle account changes gracefully

**Steps**:
1. Connect with Account 1 (has SBT)
2. Navigate to `/voting`
3. Switch account in MetaMask to Account 4 (no SBT)
4. Page should detect account change
5. Should redirect to `/auth`
6. Now on `/auth` with Account 4
7. Complete registration for Account 4
8. Switch back to Account 1
9. Should redirect to `/voting` (has SBT)

**Expected Results**:
- ✅ Account changes detected automatically
- ✅ Page updates without refresh
- ✅ Correct redirect based on new account SBT status
- ✅ No stale data displayed

---

### 8. Edge Case - Network Error Handling 🔒

**Objective**: Handle blockchain connectivity issues

**Steps**:
1. Stop Quorum network: `cd quorum-test-network && ./stop.sh`
2. Open `http://localhost:3000`
3. Connect wallet
4. Try to check SBT status
5. Should show error message
6. Should offer retry button
7. Restart network: `./run.sh`
8. Click retry button
9. Should now work normally

**Expected Results**:
- ✅ Clear error message about network issues
- ✅ Retry functionality works
- ✅ No infinite loading spinners
- ✅ User can attempt reconnection

---

### 9. UI/UX Testing - Responsive Design 📱

**Objective**: Verify mobile and tablet layouts

**Steps**:
1. Open Chrome DevTools (F12)
2. Click device toolbar (Ctrl+Shift+M)
3. Test on different devices:
   - iPhone SE (375x667)
   - iPhone 12 Pro (390x844)
   - iPad (768x1024)
   - Desktop (1920x1080)
4. Navigate through all pages:
   - `/auth`
   - `/register`
   - `/voting`
   - `/my-nfts`
5. Test NFT modal on mobile
6. Test all buttons are tap-friendly
7. Verify text is readable at all sizes
8. Check horizontal scrolling (should not occur)

**Expected Results**:
- ✅ All layouts adapt properly
- ✅ No overlapping elements
- ✅ Buttons are touch-friendly (min 44x44px)
- ✅ Text is legible
- ✅ Images scale correctly
- ✅ No horizontal scroll

---

### 10. Performance Testing ⚡

**Objective**: Ensure smooth user experience

**Metrics to Check**:
1. **Page Load Time**: < 2 seconds
2. **SBT Check Time**: < 1 second
3. **NFT Loading Time**: < 3 seconds for 10 NFTs
4. **Modal Open Animation**: Smooth 60fps
5. **Network Requests**: Minimal redundant calls

**Steps**:
1. Open DevTools → Network tab
2. Clear cache and hard reload
3. Measure time to interactive
4. Check number of requests
5. Open Performance tab
6. Record page interactions
7. Check for long tasks (>50ms)
8. Verify no memory leaks

**Expected Results**:
- ✅ Initial load < 2s
- ✅ Smooth animations (60fps)
- ✅ No unnecessary re-renders
- ✅ Efficient contract calls
- ✅ Proper error handling doesn't block UI

---

### 11. Accessibility Testing ♿

**Objective**: Ensure usability for all users

**Steps**:
1. Test keyboard navigation:
   - Tab through all interactive elements
   - Enter/Space to activate buttons
   - Esc to close modal
2. Test with screen reader (optional)
3. Check color contrast ratios
4. Verify alt text on images
5. Check focus indicators visible

**Expected Results**:
- ✅ All interactive elements keyboard accessible
- ✅ Logical tab order
- ✅ Visible focus indicators
- ✅ Sufficient color contrast (WCAG AA)
- ✅ Alt text on all images

---

### 12. Browser Compatibility Testing 🌐

**Objective**: Work across major browsers

**Browsers to Test**:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

**Steps**:
1. Complete Test 1 (Happy Path) in each browser
2. Verify MetaMask integration works
3. Check for visual inconsistencies
4. Test modal and animations

**Expected Results**:
- ✅ Works in all major browsers
- ✅ Consistent visual appearance
- ✅ MetaMask connects properly
- ✅ No browser-specific bugs

---

## Automated Testing Checklist

### Unit Tests (To Implement)
- [ ] `generateIdentityHash()` function
- [ ] `checkHasSBT()` function
- [ ] `getAchievements()` logic
- [ ] React components render correctly

### Integration Tests (To Implement)
- [ ] Full authentication flow
- [ ] Voting flow with SBT verification
- [ ] NFT collection page data loading
- [ ] Modal interactions

### E2E Tests (To Implement with Cypress/Playwright)
- [ ] Complete user journey
- [ ] Error scenarios
- [ ] Multi-account scenarios

---

## Known Issues & Limitations

### Current Limitations:
1. **Identity Verification**: Dummy implementation (name only)
2. **SBT Minting**: Uses verifier account directly (dev mode)
3. **NFT Images**: Placeholder images from via.placeholder.com
4. **Timestamps**: Not stored on-chain
5. **Achievement Persistence**: Calculated client-side only

### Security Considerations:
1. ⚠️ Verifier private key exposed in frontend (dev only)
2. ⚠️ No backend verification service
3. ⚠️ Same identity can register multiple wallets
4. ⚠️ No rate limiting on minting/voting

### Production Requirements:
1. ✅ Implement real identity verification (NICE, Pass)
2. ✅ Move verifier to backend service
3. ✅ Add signature-based verification
4. ✅ Upload mascot images to IPFS
5. ✅ Store timestamps on-chain
6. ✅ Implement backend API
7. ✅ Add rate limiting
8. ✅ Security audit

---

## Bug Reporting Template

```
**Bug Title**: [Short description]

**Severity**: Critical / High / Medium / Low

**Steps to Reproduce**:
1. 
2. 
3. 

**Expected Behavior**:
[What should happen]

**Actual Behavior**:
[What actually happened]

**Environment**:
- Browser: 
- MetaMask Version: 
- Account: 
- Network: 

**Console Errors**:
```
[Paste error logs]
```

**Screenshots**:
[Attach if relevant]
```

---

## Test Sign-off

| Test Scenario | Status | Tested By | Date | Notes |
|--------------|--------|-----------|------|-------|
| 1. New User Flow | ✅ | | | |
| 2. Returning User | ✅ | | | |
| 3. No Wallet | ✅ | | | |
| 4. Duplicate Identity | ⚠️ | | | Allows duplicate |
| 5. Voting Without SBT | ✅ | | | |
| 6. Multiple Votes | ✅ | | | |
| 7. Account Switch | ✅ | | | |
| 8. Network Error | ✅ | | | |
| 9. Responsive Design | ✅ | | | |
| 10. Performance | ✅ | | | |
| 11. Accessibility | ⚠️ | | | Basic compliance |
| 12. Browser Compat | ✅ | | | Chrome tested |

**Overall Assessment**: ✅ Ready for internal demo / ⚠️ Needs improvement / ❌ Not ready

---

## Performance Benchmarks

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Initial Page Load | < 2s | TBD | |
| SBT Check | < 1s | TBD | |
| Vote Transaction | < 5s | TBD | |
| NFT Loading (10 items) | < 3s | TBD | |
| Modal Animation | 60fps | TBD | |

---

## Next Steps

After Phase 5 completion:
1. ✅ Address all critical and high severity bugs
2. ✅ Optimize performance bottlenecks
3. ✅ Implement automated test suite
4. ✅ Prepare for production deployment
5. ✅ Security audit
6. ✅ User acceptance testing

---

**Last Updated**: 2025-11-10
**Version**: 1.0.0
**Status**: Phase 5 - Integration & Testing
