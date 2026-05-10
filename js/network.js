name: Deploy to GitHub Pages
on:
  push:
    branches: [ main ]
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Inject Secrets
        run: |
          TARGET="js/network.js"
          if [ ! -f "$TARGET" ]; then
            echo "❌ $TARGET 파일 없음"
            ls -R
            exit 1
          fi
          sed -i "s|__VITE_FB_API_KEY__|${{ secrets.VITE_FB_API_KEY }}|g" $TARGET
          sed -i "s|__VITE_FB_AUTH_DOMAIN__|${{ secrets.VITE_FB_AUTH_DOMAIN }}|g" $TARGET
          sed -i "s|__VITE_FB_DATABASE_URL__|${{ secrets.VITE_FB_DATABASE_URL }}|g" $TARGET
          sed -i "s|__VITE_FB_PROJECT_ID__|${{ secrets.VITE_FB_PROJECT_ID }}|g" $TARGET
          sed -i "s|__VITE_FB_STORAGE_BUCKET__|${{ secrets.VITE_FB_STORAGE_BUCKET }}|g" $TARGET
          sed -i "s|__VITE_FB_MESSAGING_SENDER_ID__|${{ secrets.VITE_FB_MESSAGING_SENDER_ID }}|g" $TARGET
          sed -i "s|__VITE_FB_APP_ID__|${{ secrets.VITE_FB_APP_ID }}|g" $TARGET
          sed -i "s|__VITE_FB_MEASUREMENT_ID__|${{ secrets.VITE_FB_MEASUREMENT_ID }}|g" $TARGET
          echo "✅ 치환 완료"
          grep "databaseURL" $TARGET  # 확인용

      - name: Deploy to GitHub Pages
        uses: JamesIves/github-pages-deploy-action@v4
        with:
          folder: .
          branch: gh-pages
