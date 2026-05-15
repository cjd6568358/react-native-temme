package com.temme.lexbor;

import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;

import java.util.HashMap;
import java.util.Map;

/**
 * React Native Android bridge for lexbor HTML parser.
 *
 * Exposes synchronous native methods backed by liblexbor.so (arm64-v8a).
 * Called from JS via NativeModules.LexborModule (see adapter.js).
 */
@ReactModule(name = LexborModule.NAME)
public class LexborModule extends ReactContextBaseJavaModule {

    static final String NAME = "LexborModule";
    private static final String TAG = "LexborModule";
    private static boolean sLoaded = false;

    // Document handle -> native pointer mapping
    private final Map<Long, Long> mDocuments = new HashMap<>();
    private long mNextHandle = 1;

    public LexborModule(ReactApplicationContext context) {
        super(context);
        if (!sLoaded) {
            try {
                System.loadLibrary("lexbor");
                sLoaded = true;
            } catch (UnsatisfiedLinkError e) {
                Log.e(TAG, "Failed to load liblexbor.so", e);
            }
        }
    }

    @Override
    public String getName() {
        return NAME;
    }

    // ── Document lifecycle ──

    @ReactMethod(isBlockingSynchronousMethod = true)
    public long createDocument(String html) {
        if (!sLoaded) return -1;
        long docPtr = nativeCreateDocument(html);
        if (docPtr == 0) return -1;
        long handle = mNextHandle++;
        mDocuments.put(handle, docPtr);
        return handle;
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    public void destroyDocument(long handle) {
        Long docPtr = mDocuments.remove(handle);
        if (docPtr != null && docPtr != 0) {
            nativeDestroyDocument(docPtr);
        }
    }

    // ── Query ──

    @ReactMethod(isBlockingSynchronousMethod = true)
    public double[] querySelectorAll(long handle, String selector) {
        Long docPtr = mDocuments.get(handle);
        if (docPtr == null) return new double[0];
        long[] nodePtrs = nativeQuerySelectorAll(docPtr, selector);
        double[] result = new double[nodePtrs.length];
        for (int i = 0; i < nodePtrs.length; i++) {
            result[i] = nodePtrs[i];
        }
        return result;
    }

    // ── Node accessors ──

    @ReactMethod(isBlockingSynchronousMethod = true)
    public double getNodeType(long handle, double nodeHandle) {
        Long docPtr = mDocuments.get(handle);
        if (docPtr == null) return -1;
        return nativeGetNodeType(docPtr, (long) nodeHandle);
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    public String getTagName(long handle, double nodeHandle) {
        Long docPtr = mDocuments.get(handle);
        if (docPtr == null) return null;
        return nativeGetTagName(docPtr, (long) nodeHandle);
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    public String getNodeText(long handle, double nodeHandle) {
        Long docPtr = mDocuments.get(handle);
        if (docPtr == null) return "";
        return nativeGetNodeText(docPtr, (long) nodeHandle);
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    public String getNodeAttr(long handle, double nodeHandle, String attrName) {
        Long docPtr = mDocuments.get(handle);
        if (docPtr == null) return null;
        return nativeGetNodeAttr(docPtr, (long) nodeHandle, attrName);
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    public String getNodeHtml(long handle, double nodeHandle) {
        Long docPtr = mDocuments.get(handle);
        if (docPtr == null) return "";
        return nativeGetNodeHtml(docPtr, (long) nodeHandle);
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    public String getNodeOuterHtml(long handle, double nodeHandle) {
        Long docPtr = mDocuments.get(handle);
        if (docPtr == null) return "";
        return nativeGetNodeOuterHtml(docPtr, (long) nodeHandle);
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    public boolean isNodeMatch(long handle, double nodeHandle, String selector) {
        Long docPtr = mDocuments.get(handle);
        if (docPtr == null) return false;
        return nativeIsNodeMatch(docPtr, (long) nodeHandle, selector);
    }

    // ── Tree traversal ──

    @ReactMethod(isBlockingSynchronousMethod = true)
    public double getParentHandle(long handle, double nodeHandle) {
        Long docPtr = mDocuments.get(handle);
        if (docPtr == null) return -1;
        long parentPtr = nativeGetParentHandle(docPtr, (long) nodeHandle);
        return parentPtr;
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    public double[] getChildHandles(long handle, double nodeHandle) {
        Long docPtr = mDocuments.get(handle);
        if (docPtr == null) return new double[0];
        long[] childPtrs = nativeGetChildHandles(docPtr, (long) nodeHandle);
        double[] result = new double[childPtrs.length];
        for (int i = 0; i < childPtrs.length; i++) {
            result[i] = childPtrs[i];
        }
        return result;
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    public double getRootHandle(long handle) {
        Long docPtr = mDocuments.get(handle);
        if (docPtr == null) return -1;
        return nativeGetRootHandle(docPtr);
    }

    // ── Native methods (implemented in lexbor_jni.cpp) ──

    private static native long nativeCreateDocument(String html);
    private static native void nativeDestroyDocument(long docPtr);
    private static native long[] nativeQuerySelectorAll(long docPtr, String selector);
    private static native int nativeGetNodeType(long docPtr, long nodePtr);
    private static native String nativeGetTagName(long docPtr, long nodePtr);
    private static native String nativeGetNodeText(long docPtr, long nodePtr);
    private static native String nativeGetNodeAttr(long docPtr, long nodePtr, String attrName);
    private static native String nativeGetNodeHtml(long docPtr, long nodePtr);
    private static native String nativeGetNodeOuterHtml(long docPtr, long nodePtr);
    private static native boolean nativeIsNodeMatch(long docPtr, long nodePtr, String selector);
    private static native long nativeGetParentHandle(long docPtr, long nodePtr);
    private static native long[] nativeGetChildHandles(long docPtr, long nodePtr);
    private static native long nativeGetRootHandle(long docPtr);
}
