package kr.meatos.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.content.FileProvider;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.io.File;
import java.net.URISyntaxException;

/**
 * 정육비서 안드로이드 앱.
 * 웹(meatos.vercel.app)을 앱 안에서 열고, 앱다운 기능(뒤로가기·당겨서 새로고침·오프라인 화면·
 * 사진 촬영 업로드·외부 앱 연결)을 더한다. 구글 로그인은 구글 정책상 앱 내부 웹뷰에서 막히므로
 * 외부 브라우저(Custom Tab)로 넘기고, 로그인 후 kr.meatos.app://auth/... 로 앱에 돌아온다.
 */
public class MainActivity extends Activity {

    private static final String HOME = "https://meatos.vercel.app/";
    private static final String HOST = "meatos.vercel.app";
    private static final String APP_SCHEME = "kr.meatos.app";
    private static final String USER_AGENT_MARK = " MEATOSApp/1";
    private static final int REQ_FILE = 1001;

    private WebView web;
    private SwipeRefreshLayout refresh;
    private ProgressBar progress;
    private View offline;

    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private File cameraFile;
    private boolean mainFrameError = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        View root = findViewById(R.id.root);
        web = findViewById(R.id.web);
        refresh = findViewById(R.id.refresh);
        progress = findViewById(R.id.progress);
        offline = findViewById(R.id.offline);

        setupEdgeToEdge(root);
        setupWebView();

        refresh.setColorSchemeColors(0xFFC51624);
        refresh.setOnRefreshListener(() -> web.reload());
        findViewById(R.id.retry).setOnClickListener(v -> {
            offline.setVisibility(View.GONE);
            String current = web.getUrl();
            if (current == null || current.startsWith("about:")) web.loadUrl(HOME);
            else web.reload();
        });

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }

        if (savedInstanceState != null && web.restoreState(savedInstanceState) != null) {
            return;
        }
        if (!openFromIntent(getIntent())) {
            web.loadUrl(HOME);
        }
    }

    // ── 화면 가장자리(상태표시줄·내비게이션바·키보드) 처리 ─────────────────────────
    @SuppressWarnings("deprecation")
    private void setupEdgeToEdge(View root) {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
        } else {
            int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
            if (Build.VERSION.SDK_INT >= 23) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= 26) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            root.setSystemUiVisibility(flags);
        }
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int left, top, right, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                left = bars.left;
                top = bars.top;
                right = bars.right;
                bottom = Math.max(bars.bottom, ime.bottom);
            } else {
                left = insets.getSystemWindowInsetLeft();
                top = insets.getSystemWindowInsetTop();
                right = insets.getSystemWindowInsetRight();
                bottom = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(left, top, right, bottom);
            return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
        });
        root.post(() -> {
            if (Build.VERSION.SDK_INT >= 30) {
                WindowInsetsController c = getWindow().getInsetsController();
                if (c != null) {
                    int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                    c.setSystemBarsAppearance(light, light);
                }
            }
            root.requestApplyInsets();
        });
    }

    // ── 웹뷰 설정 ─────────────────────────────────────────────────────────────
    private void setupWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // 로그인 정보(localStorage) 유지
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + USER_AGENT_MARK);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);   // 카카오·네이버 로그인 쿠키

        web.setWebViewClient(new AppWebViewClient());
        web.setWebChromeClient(new AppChromeClient());
        // 파일 내려받기(예: PC용 POS 설치 파일)는 휴대폰 브라우저로 넘긴다
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) ->
                openExternal(Uri.parse(url)));
    }

    private class AppWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return route(view, request.getUrl());
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            mainFrameError = false;
            progress.setVisibility(View.VISIBLE);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            progress.setVisibility(View.GONE);
            refresh.setRefreshing(false);
            if (!mainFrameError) offline.setVisibility(View.GONE);
            CookieManager.getInstance().flush();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                mainFrameError = true;
                refresh.setRefreshing(false);
                progress.setVisibility(View.GONE);
                offline.setVisibility(View.VISIBLE);
            }
        }
    }

    /** 앱 안에서 열지, 외부 앱/브라우저로 넘길지 결정한다. true = 웹뷰가 열지 않음. */
    private boolean route(WebView view, Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (scheme.equals("http") || scheme.equals("https")) {
            if (isGoogleSignIn(uri)) {
                openCustomTab(uri);
                return true;
            }
            return false;   // 정육비서·카카오·네이버 등 일반 웹 페이지는 앱 안에서
        }
        if (scheme.equals("intent")) {
            openIntentUri(view, uri.toString());
            return true;
        }
        if (scheme.equals("about") || scheme.equals("data") || scheme.equals("blob") || scheme.equals("javascript")) {
            return false;
        }
        openExternal(uri);  // tel:, mailto:, sms:, kakaotalk:, market: 등
        return true;
    }

    private boolean isGoogleSignIn(Uri uri) {
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
        if (host.equals("accounts.google.com")) return true;
        String path = uri.getPath() == null ? "" : uri.getPath();
        return host.endsWith(".supabase.co")
                && path.startsWith("/auth/v1/authorize")
                && "google".equalsIgnoreCase(uri.getQueryParameter("provider"));
    }

    private void openIntentUri(WebView view, String url) {
        try {
            Intent intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.setComponent(null);
            intent.setSelector(null);
            try {
                startActivity(intent);
            } catch (ActivityNotFoundException e) {
                String fallback = intent.getStringExtra("browser_fallback_url");
                if (fallback != null && (fallback.startsWith("https://") || fallback.startsWith("http://"))) {
                    view.loadUrl(fallback);
                } else if (intent.getPackage() != null) {
                    openExternal(Uri.parse("market://details?id=" + intent.getPackage()));
                }
            }
        } catch (URISyntaxException e) {
            Toast.makeText(this, R.string.no_app, Toast.LENGTH_SHORT).show();
        }
    }

    private void openExternal(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.no_app, Toast.LENGTH_SHORT).show();
        }
    }

    private void openCustomTab(Uri uri) {
        try {
            new CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this, uri);
        } catch (ActivityNotFoundException e) {
            openExternal(uri);
        }
    }

    // ── 로그인 후 앱으로 돌아오기: kr.meatos.app://auth/login.html?...#access_token=... ──
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openFromIntent(intent);
    }

    private boolean openFromIntent(Intent intent) {
        if (intent == null || intent.getData() == null) return false;
        Uri data = intent.getData();
        String scheme = data.getScheme() == null ? "" : data.getScheme();
        if (APP_SCHEME.equals(scheme) && "auth".equals(data.getHost())) {
            String path = data.getEncodedPath();
            if (path == null || !path.startsWith("/") || path.startsWith("//")) path = "/login.html";
            StringBuilder target = new StringBuilder("https://").append(HOST).append(path);
            if (data.getEncodedQuery() != null) target.append('?').append(data.getEncodedQuery());
            if (data.getEncodedFragment() != null) target.append('#').append(data.getEncodedFragment());
            web.loadUrl(target.toString());
            return true;
        }
        if ("https".equals(scheme) && HOST.equals(data.getHost())) {
            web.loadUrl(data.toString());
            return true;
        }
        return false;
    }

    // ── 사진·파일 올리기 (거래명세서 촬영, 라벨 사진, CSV) ───────────────────────
    private class AppChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progress.setProgress(newProgress);
            if (newProgress >= 100) progress.setVisibility(View.GONE);
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            cameraUri = null;
            cameraFile = null;

            boolean imagesOnly = acceptsOnlyImages(params.getAcceptTypes());
            Intent camera = imagesOnly ? createCameraIntent() : null;

            try {
                if (params.isCaptureEnabled() && camera != null) {
                    startActivityForResult(camera, REQ_FILE);
                    return true;
                }
                Intent picker = new Intent(Intent.ACTION_GET_CONTENT);
                picker.addCategory(Intent.CATEGORY_OPENABLE);
                picker.setType(imagesOnly ? "image/*" : "*/*");
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                Intent chooser = Intent.createChooser(picker,
                        getString(imagesOnly ? R.string.choose_photo : R.string.choose_file));
                if (camera != null) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
                startActivityForResult(chooser, REQ_FILE);
                return true;
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                callback.onReceiveValue(null);
                Toast.makeText(MainActivity.this, R.string.no_app, Toast.LENGTH_SHORT).show();
                return true;
            }
        }
    }

    private static boolean acceptsOnlyImages(String[] types) {
        if (types == null || types.length == 0) return false;
        boolean any = false;
        for (String t : types) {
            if (t == null || t.trim().isEmpty()) continue;
            any = true;
            if (!t.trim().toLowerCase().startsWith("image/")) return false;
        }
        return any;
    }

    private Intent createCameraIntent() {
        try {
            File dir = new File(getCacheDir(), "camera");
            if (!dir.exists() && !dir.mkdirs()) return null;
            File file = new File(dir, "photo_" + System.currentTimeMillis() + ".jpg");
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, uri);
            intent.setClipData(ClipData.newRawUri("photo", uri));
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            cameraFile = file;
            cameraUri = uri;
            return intent;
        } catch (Exception e) {
            cameraFile = null;
            cameraUri = null;
            return null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE || fileCallback == null) return;
        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getClipData() != null && data.getClipData().getItemCount() > 0) {
                ClipData clip = data.getClipData();
                results = new Uri[clip.getItemCount()];
                for (int i = 0; i < clip.getItemCount(); i++) results[i] = clip.getItemAt(i).getUri();
            } else if (data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            } else if (cameraUri != null && cameraFile != null && cameraFile.length() > 0) {
                results = new Uri[]{cameraUri};
            }
        }
        fileCallback.onReceiveValue(results);
        fileCallback = null;
    }

    // ── 뒤로가기: 웹 페이지 뒤로 → 더 없으면 앱 닫기 ────────────────────────────
    private void handleBack() {
        if (offline.getVisibility() == View.VISIBLE && web.canGoBack()) {
            offline.setVisibility(View.GONE);
        }
        if (web.canGoBack()) web.goBack();
        else finish();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleBack();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.stopLoading();
            web.destroy();
        }
        super.onDestroy();
    }
}
