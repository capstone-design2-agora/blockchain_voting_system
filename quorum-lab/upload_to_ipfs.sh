#!/bin/bash

# IPFS 이미지 업로드 가이드
# 
# 방법 1: Pinata 사용 (가장 쉬움)
# ====================================
# 1. https://pinata.cloud 에서 무료 계정 생성
# 2. API Key 생성 (Dashboard → API Keys → New Key)
# 3. 아래 값을 실제 값으로 변경
# 4. 이 스크립트 실행

PINATA_API_KEY="YOUR_PINATA_API_KEY"
PINATA_SECRET_KEY="YOUR_PINATA_SECRET_KEY"

# 이미지 폴더 경로
IMAGES_DIR="../mascots"

# Pinata에 업로드
upload_to_pinata() {
    echo "📤 Uploading to Pinata..."
    
    if [ ! -d "$IMAGES_DIR" ]; then
        echo "❌ Error: Directory $IMAGES_DIR not found!"
        echo "💡 Create the directory and add your mascot images:"
        echo "   mkdir -p mascots"
        echo "   # Add images: citizen-2025.png, etc."
        exit 1
    fi
    
    # Pinata API를 사용한 업로드
    response=$(curl -X POST "https://api.pinata.cloud/pinning/pinFileToIPFS" \
        -H "pinata_api_key: $PINATA_API_KEY" \
        -H "pinata_secret_api_key: $PINATA_SECRET_KEY" \
        -F "file=@$IMAGES_DIR")
    
    # CID 추출
    cid=$(echo $response | jq -r '.IpfsHash')
    
    if [ "$cid" != "null" ] && [ ! -z "$cid" ]; then
        echo "✅ Upload successful!"
        echo "📍 IPFS CID: $cid"
        echo ""
        echo "🔗 Access URLs:"
        echo "   Pinata:  https://gateway.pinata.cloud/ipfs/$cid/"
        echo "   IPFS.io: https://ipfs.io/ipfs/$cid/"
        echo ""
        echo "📝 Update deploy.env:"
        echo "   MASCOT_BASE_URI=\"https://gateway.pinata.cloud/ipfs/$cid/\""
    else
        echo "❌ Upload failed!"
        echo "Response: $response"
    fi
}

# 방법 2: IPFS Desktop 사용
# ====================================
ipfs_desktop_guide() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📱 Alternative: IPFS Desktop"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "1. Download IPFS Desktop:"
    echo "   https://github.com/ipfs/ipfs-desktop/releases"
    echo ""
    echo "2. Install and run IPFS Desktop"
    echo ""
    echo "3. Add mascots folder:"
    echo "   - Click 'Files' → 'Import' → 'Folder'"
    echo "   - Select your mascots directory"
    echo ""
    echo "4. Copy CID and update deploy.env:"
    echo "   MASCOT_BASE_URI=\"https://ipfs.io/ipfs/YOUR_CID/\""
    echo ""
}

# 방법 3: 임시로 로컬 서버 사용
# ====================================
local_server_guide() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "💻 Quick Test: Local HTTP Server"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "For testing without IPFS:"
    echo ""
    echo "1. Create mascots directory:"
    echo "   mkdir -p ../frontend/public/mascots"
    echo "   # Add your images there"
    echo ""
    echo "2. Update deploy.env:"
    echo "   MASCOT_BASE_URI=\"http://localhost:3000/mascots/\""
    echo ""
    echo "3. Images will be served by React dev server"
    echo ""
}

# 메인 메뉴
show_menu() {
    echo ""
    echo "🎨 NFT Mascot Image Upload Tool"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Choose upload method:"
    echo "  1) Pinata (recommended, requires API key)"
    echo "  2) IPFS Desktop (manual, user-friendly)"
    echo "  3) Local server (quick test, no IPFS)"
    echo "  4) Exit"
    echo ""
    read -p "Enter choice [1-4]: " choice
    
    case $choice in
        1) upload_to_pinata ;;
        2) ipfs_desktop_guide ;;
        3) local_server_guide ;;
        4) echo "Bye!"; exit 0 ;;
        *) echo "Invalid choice!"; show_menu ;;
    esac
}

# 실행
show_menu
