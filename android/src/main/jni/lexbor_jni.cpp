/**
 * JNI bridge for lexbor HTML parser.
 *
 * Loads liblexbor.so and exposes C API functions to Java (LexborModule.java).
 * Called from React Native's NativeModules.LexborModule -> adapter.js.
 *
 * Architecture:
 *   JS (adapter.js) -> Java (LexborModule.java) -> JNI (lexbor_jni.cpp) -> liblexbor.so
 */

#include <jni.h>
#include <string>
#include <vector>

#include <lexbor/html/html.h>
#include <lexbor/dom/dom.h>
#include <lexbor/css/css.h>
#include <lexbor/selectors/selectors.h>

// ── Global CSS parser and selectors engine (reused across calls) ──

static lxb_css_parser_t *gCssParser = nullptr;
static lxb_selectors_t *gSelectors = nullptr;

static void ensureGlobals() {
    if (gCssParser) return;
    gCssParser = lxb_css_parser_create();
    lxb_css_parser_init(gCssParser, nullptr);
    gSelectors = lxb_selectors_create();
    lxb_selectors_init(gSelectors);
}

// ── Helper: jstring -> C string ──

struct CString {
    JNIEnv *env;
    jstring jstr;
    const char *ptr;

    CString(JNIEnv *e, jstring s) : env(e), jstr(s), ptr(e->GetStringUTFChars(s, nullptr)) {}
    ~CString() { if (ptr) env->ReleaseStringUTFChars(jstr, ptr); }
};

// ── Helper: build Java double[] from vector of pointers ──

static jdoubleArray ptrsToJdoubleArray(JNIEnv *env, const std::vector<jlong> &ptrs) {
    jdoubleArray arr = env->NewDoubleArray((jsize) ptrs.size());
    if (!arr) return nullptr;
    std::vector<jdouble> d(ptrs.begin(), ptrs.end());
    env->SetDoubleArrayRegion(arr, 0, (jsize) d.size(), d.data());
    return arr;
}

// ── Helper: build Java long[] from vector ──

static jlongArray ptrsToJlongArray(JNIEnv *env, const std::vector<jlong> &ptrs) {
    jlongArray arr = env->NewLongArray((jsize) ptrs.size());
    if (!arr) return nullptr;
    env->SetLongArrayRegion(arr, 0, (jsize) ptrs.size(), ptrs.data());
    return arr;
}

// ── Helper: serialize node inner HTML ──

struct SerializeCtx {
    std::string buf;
};

static lxb_status_t serializeCb(const lxb_char_t *data, size_t len, void *ctx) {
    auto *sc = static_cast<SerializeCtx *>(ctx);
    sc->buf.append(reinterpret_cast<const char *>(data), len);
    return LXB_STATUS_OK;
}

static std::string getOuterHtml(lxb_dom_node_t *node) {
    SerializeCtx ctx;
    lxb_html_serialize_cb(node, serializeCb, &ctx);
    return ctx.buf;
}

static std::string getInnerHtml(lxb_dom_node_t *node) {
    std::string outer = getOuterHtml(node);
    // Strip the outermost opening and closing tags
    auto start = outer.find('>');
    if (start == std::string::npos) return outer;
    auto end = outer.rfind('<');
    if (end == std::string::npos || end <= start) return outer;
    return outer.substr(start + 1, end - start - 1);
}

// ── Selector callback for lxb_selectors_find ──

struct FindCtx {
    std::vector<jlong> results;
};

static lxb_status_t findCallback(lxb_dom_node_t *node,
                                  lxb_css_selector_specificity_t spec,
                                  void *ctx) {
    if (node) {
        static_cast<FindCtx *>(ctx)->results.push_back(reinterpret_cast<jlong>(node));
    }
    return LXB_STATUS_OK;
}

// ─────────────────────────────────────────────────────────────
// JNI exports
// ─────────────────────────────────────────────────────────────

extern "C" {

// ── Document lifecycle ──

JNIEXPORT jlong JNICALL
Java_com_temme_lexbor_LexborModule_nativeCreateDocument(JNIEnv *env, jclass, jstring jHtml) {
    CString html(env, jHtml);

    auto *doc = lxb_html_document_create();
    if (!doc) return 0;

    lxb_status_t status = lxb_html_document_parse(doc,
        reinterpret_cast<const lxb_char_t *>(html.ptr),
        strlen(html.ptr));

    if (status != LXB_STATUS_OK) {
        lxb_html_document_destroy(doc);
        return 0;
    }

    return reinterpret_cast<jlong>(doc);
}

JNIEXPORT void JNICALL
Java_com_temme_lexbor_LexborModule_nativeDestroyDocument(JNIEnv *, jclass, jlong docPtr) {
    if (docPtr == 0) return;
    auto *doc = reinterpret_cast<lxb_html_document_t *>(docPtr);
    lxb_html_document_destroy(doc);
}

// ── Query ──

JNIEXPORT jdoubleArray JNICALL
Java_com_temme_lexbor_LexborModule_nativeQuerySelectorAll(JNIEnv *env, jclass,
                                                           jlong docPtr, jstring jSelector) {
    if (docPtr == 0) return env->NewDoubleArray(0);
    CString selector(env, jSelector);
    auto *doc = reinterpret_cast<lxb_html_document_t *>(docPtr);

    ensureGlobals();

    lxb_css_selector_list_t *list = lxb_css_selectors_parse(
        gCssParser,
        reinterpret_cast<const lxb_char_t *>(selector.ptr),
        strlen(selector.ptr));

    if (!list) {
        lxb_css_parser_clean(gCssParser);
        return env->NewDoubleArray(0);
    }

    FindCtx ctx;
    lxb_selectors_find(gSelectors,
                       lxb_dom_interface_node(doc),
                       list,
                       findCallback,
                       &ctx);

    lxb_selectors_clean(gSelectors);
    lxb_css_selector_list_destroy_memory(list);

    return ptrsToJdoubleArray(env, ctx.results);
}

// ── Node accessors ──

JNIEXPORT jint JNICALL
Java_com_temme_lexbor_LexborModule_nativeGetNodeType(JNIEnv *, jclass, jlong, jlong nodePtr) {
    if (nodePtr == 0) return -1;
    auto *node = reinterpret_cast<lxb_dom_node_t *>(nodePtr);
    return static_cast<jint>(node->type);
}

JNIEXPORT jstring JNICALL
Java_com_temme_lexbor_LexborModule_nativeGetTagName(JNIEnv *env, jclass, jlong, jlong nodePtr) {
    if (nodePtr == 0) return nullptr;
    auto *node = reinterpret_cast<lxb_dom_node_t *>(nodePtr);
    auto *element = lxb_dom_interface_element(node);
    if (!element) return nullptr;

    size_t len = 0;
    const lxb_char_t *name = lxb_dom_element_local_name(element, &len);
    if (!name || len == 0) return nullptr;

    return env->NewStringUTF(std::string(reinterpret_cast<const char *>(name), len).c_str());
}

JNIEXPORT jstring JNICALL
Java_com_temme_lexbor_LexborModule_nativeGetNodeText(JNIEnv *env, jclass, jlong, jlong nodePtr) {
    if (nodePtr == 0) return env->NewStringUTF("");
    auto *node = reinterpret_cast<lxb_dom_node_t *>(nodePtr);

    size_t len = 0;
    lxb_char_t *text = lxb_dom_node_text_content(node, &len);
    if (!text || len == 0) return env->NewStringUTF("");

    std::string result(reinterpret_cast<const char *>(text), len);
    lexbor_free(text);
    return env->NewStringUTF(result.c_str());
}

JNIEXPORT jstring JNICALL
Java_com_temme_lexbor_LexborModule_nativeGetNodeAttr(JNIEnv *env, jclass,
                                                      jlong, jlong nodePtr, jstring jAttrName) {
    if (nodePtr == 0) return nullptr;
    CString attrName(env, jAttrName);
    auto *node = reinterpret_cast<lxb_dom_node_t *>(nodePtr);
    auto *element = lxb_dom_interface_element(node);
    if (!element) return nullptr;

    size_t valLen = 0;
    const lxb_char_t *val = lxb_dom_element_get_attribute(
        element,
        reinterpret_cast<const lxb_char_t *>(attrName.ptr),
        strlen(attrName.ptr),
        &valLen);

    if (!val) return nullptr;
    return env->NewStringUTF(std::string(reinterpret_cast<const char *>(val), valLen).c_str());
}

JNIEXPORT jstring JNICALL
Java_com_temme_lexbor_LexborModule_nativeGetNodeHtml(JNIEnv *env, jclass, jlong, jlong nodePtr) {
    if (nodePtr == 0) return env->NewStringUTF("");
    auto *node = reinterpret_cast<lxb_dom_node_t *>(nodePtr);
    std::string html = getInnerHtml(node);
    return env->NewStringUTF(html.c_str());
}

JNIEXPORT jstring JNICALL
Java_com_temme_lexbor_LexborModule_nativeGetNodeOuterHtml(JNIEnv *env, jclass, jlong, jlong nodePtr) {
    if (nodePtr == 0) return env->NewStringUTF("");
    auto *node = reinterpret_cast<lxb_dom_node_t *>(nodePtr);
    std::string html = getOuterHtml(node);
    return env->NewStringUTF(html.c_str());
}

JNIEXPORT jboolean JNICALL
Java_com_temme_lexbor_LexborModule_nativeIsNodeMatch(JNIEnv *env, jclass,
                                                      jlong docPtr, jlong nodePtr,
                                                      jstring jSelector) {
    if (docPtr == 0 || nodePtr == 0) return JNI_FALSE;
    CString selector(env, jSelector);
    auto *node = reinterpret_cast<lxb_dom_node_t *>(nodePtr);

    ensureGlobals();

    lxb_css_selector_list_t *list = lxb_css_selectors_parse(
        gCssParser,
        reinterpret_cast<const lxb_char_t *>(selector.ptr),
        strlen(selector.ptr));

    if (!list) {
        lxb_css_parser_clean(gCssParser);
        return JNI_FALSE;
    }

    // Use the parent as search root, then check if our node is in results
    lxb_dom_node_t *searchRoot = node->parent ? node->parent : node;

    FindCtx ctx;
    lxb_selectors_find(gSelectors, searchRoot, list, findCallback, &ctx);

    lxb_selectors_clean(gSelectors);
    lxb_css_selector_list_destroy_memory(list);

    jlong nodePtrVal = static_cast<jlong>(nodePtr);
    for (auto ptr : ctx.results) {
        if (ptr == nodePtrVal) return JNI_TRUE;
    }
    return JNI_FALSE;
}

// ── Tree traversal ──

JNIEXPORT jlong JNICALL
Java_com_temme_lexbor_LexborModule_nativeGetParentHandle(JNIEnv *, jclass, jlong, jlong nodePtr) {
    if (nodePtr == 0) return -1;
    auto *node = reinterpret_cast<lxb_dom_node_t *>(nodePtr);
    if (!node->parent) return -1;
    return reinterpret_cast<jlong>(node->parent);
}

JNIEXPORT jdoubleArray JNICALL
Java_com_temme_lexbor_LexborModule_nativeGetChildHandles(JNIEnv *env, jclass,
                                                          jlong, jlong nodePtr) {
    if (nodePtr == 0) return env->NewDoubleArray(0);
    auto *node = reinterpret_cast<lxb_dom_node_t *>(nodePtr);

    std::vector<jlong> children;
    lxb_dom_node_t *child = node->first_child;
    while (child) {
        children.push_back(reinterpret_cast<jlong>(child));
        child = child->next;
    }

    return ptrsToJdoubleArray(env, children);
}

JNIEXPORT jlong JNICALL
Java_com_temme_lexbor_LexborModule_nativeGetRootHandle(JNIEnv *, jclass, jlong docPtr) {
    if (docPtr == 0) return -1;
    auto *doc = reinterpret_cast<lxb_html_document_t *>(docPtr);
    lxb_dom_node_t *root = lxb_dom_interface_node(doc);
    if (!root) return -1;
    // Return the document element (<html>), not the document node itself
    lxb_dom_element_t *el = lxb_html_document_element(doc);
    if (el) return reinterpret_cast<jlong>(el);
    return reinterpret_cast<jlong>(root);
}

} // extern "C"
