// D3DXVECTOR3 / D3DXMATRIX as the game uses them. The vector operators are D3DX's inline ones, compiled into the
// game (yo2Element.cpp); the matrix functions are the statically linked D3DX library (row vectors: v' = v * M).
#pragma once
#include <cmath>

struct Vec3 {
    float x = 0, y = 0, z = 0;

    // @yo2 0x0060d700 D3DXVECTOR3::operator+
    Vec3 operator+(const Vec3& o) const { return {x + o.x, y + o.y, z + o.z}; }
    // @yo2 0x0060d770 D3DXVECTOR3::operator-
    Vec3 operator-(const Vec3& o) const { return {x - o.x, y - o.y, z - o.z}; }
    // @yo2 0x0060d7e0 component-wise *
    Vec3 operator*(const Vec3& o) const { return {x * o.x, y * o.y, z * o.z}; }
    // @yo2 0x0060d850 component-wise /
    Vec3 operator/(const Vec3& o) const { return {x / o.x, y / o.y, z / o.z}; }
    // @yo2 0x0060d8c0 D3DXVECTOR3::operator*(float)
    Vec3 operator*(float f) const { return {x * f, y * f, z * f}; }
    // @yo2 0x0060d930 D3DXVECTOR3::operator/(float)
    Vec3 operator/(float f) const { return {x / f, y / f, z / f}; }
    // @yo2 0x0060d9a0 D3DXVECTOR3::operator+=
    Vec3& operator+=(const Vec3& o) { return *this = *this + o; }
    // @yo2 0x0060d9e0 D3DXVECTOR3::operator-=
    Vec3& operator-=(const Vec3& o) { return *this = *this - o; }
    // @yo2 0x0060da20 component-wise *=
    Vec3& operator*=(const Vec3& o) { return *this = *this * o; }
    // @yo2 0x0060daa0 D3DXVECTOR3::operator*=(float)
    Vec3& operator*=(float f) { return *this = *this * f; }
    // @yo2 0x0060db20 length
    float length() const { return std::sqrt(z * z + y * y + x * x); }
    // @yo2 0x0060db60 setLength: scale to `len`; zero length (or len 0) gives the zero vector
    void setLength(float len) {
        float sq = z * z + y * y + x * x;
        if (len != 0.0f && sq > 0.0f)
            *this *= len / std::sqrt(sq);
        else
            *this = {};
    }
};

struct Mat4 {
    float m[4][4];

    static Mat4 identity() { return scaling(1, 1, 1); }
    static Mat4 scaling(float sx, float sy, float sz) {
        return {{{sx, 0, 0, 0}, {0, sy, 0, 0}, {0, 0, sz, 0}, {0, 0, 0, 1}}};
    }
    static Mat4 translation(float tx, float ty, float tz) {
        Mat4 r = identity();
        r.m[3][0] = tx;
        r.m[3][1] = ty;
        r.m[3][2] = tz;
        return r;
    }
    static Mat4 rotationX(float a) {
        float c = std::cos(a), s = std::sin(a);
        return {{{1, 0, 0, 0}, {0, c, s, 0}, {0, -s, c, 0}, {0, 0, 0, 1}}};
    }
    static Mat4 rotationY(float a) {
        float c = std::cos(a), s = std::sin(a);
        return {{{c, 0, -s, 0}, {0, 1, 0, 0}, {s, 0, c, 0}, {0, 0, 0, 1}}};
    }
    static Mat4 rotationZ(float a) {
        float c = std::cos(a), s = std::sin(a);
        return {{{c, s, 0, 0}, {-s, c, 0, 0}, {0, 0, 1, 0}, {0, 0, 0, 1}}};
    }
    Mat4 operator*(const Mat4& b) const {
        Mat4 r;
        for (int i = 0; i < 4; ++i)
            for (int j = 0; j < 4; ++j)
                r.m[i][j] = m[i][0] * b.m[0][j] + m[i][1] * b.m[1][j] + m[i][2] * b.m[2][j] + m[i][3] * b.m[3][j];
        return r;
    }
    Vec3 translationPart() const { return {m[3][0], m[3][1], m[3][2]}; }
};
static_assert(sizeof(Vec3) == 12 && sizeof(Mat4) == 64, "D3DX layouts");
