// GL 3.3 core (native) / GLES 3.0 = WebGL2 (web). The renderer sticks to the common subset.
#pragma once
#if defined(__EMSCRIPTEN__)
#include <GLES3/gl3.h>
#elif defined(__APPLE__)
#define GL_SILENCE_DEPRECATION
#include <OpenGL/gl3.h>
#else
// ponytail: Linux/Mesa exports 3.3 entry points directly; Windows needs a loader (glad) when that build exists
#define GL_GLEXT_PROTOTYPES
#include <GL/gl.h>
#include <GL/glext.h>
#endif
