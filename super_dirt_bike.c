/*
 * Super Dirt Bike HD: Motocross & Trials (Native RetroPie / SDL2 Hardware-Accelerated 720p HD Edition)
 * True Fullscreen 1280x720 HD (60 FPS OpenGL ES 2.0 / VideoCore IV GPU on Raspberry Pi)
 * Features:
 *  - Mode 1: Physics Trials & Stunt Obstacle Courses (T-1 to T-4) with 2-Wheel Suspension,
 *            Boulders, Giant Logs, Wheelies (+250), Backflips/Frontflips (+1000) & Perfect Landings (+500)
 *  - Mode 2: Excitebike-Style 4-Lane Stadium Motocross GP (M-1 to M-4) with Turbo Boost Overheat Gauge,
 *            Cooling Chevrons (>>>), Mud Patches, Lane Switching & AI Rival Riders
 *  - Mode 3: Custom Track Builder (C-1) — add/remove ramps & obstacles live and ride immediately!
 *  - Continuous SDL2 Dirt Bike Engine RPM Synthesizer + Chiptune Stunt/Crash/Finish SFX over HDMI
 */

#include <SDL2/SDL.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define HD_W 1280
#define HD_H 720
#define PI 3.14159265f

#define MAX_PIECES 20
#define SEG_LEN 380.0f
#define MAX_OBSTACLES 96
#define MAX_PARTICLES 96
#define MAX_RIVALS 4

enum {
    PIECE_FLAT = 0,
    PIECE_RAMP,
    PIECE_MEGA_RAMP,
    PIECE_TABLETOP,
    PIECE_WHOOPS,
    PIECE_BOULDERS,
    PIECE_LOGS,
    PIECE_BRIDGE,
    PIECE_MUD,
    PIECE_COOL
};

enum {
    OB_BOULDER = 0,
    OB_LOG,
    OB_MUD,
    OB_COOL,
    OB_STAR
};

enum {
    SFX_NONE = 0,
    SFX_STUNT,
    SFX_COOL,
    SFX_CRASH,
    SFX_FINISH
};

typedef struct {
    Uint8 r, g, b, a;
} Color;

static Color rgba(int r, int g, int b, int a) {
    Color c = {(Uint8)r, (Uint8)g, (Uint8)b, (Uint8)a};
    return c;
}
static Color rgb(int r, int g, int b) { return rgba(r, g, b, 255); }

typedef struct {
    const char *code;
    const char *name;
    int sky_top[3];
    int sky_bot[3];
    int hill_far[3];
    int hill_near[3];
    int gnd_top[3];
    int gnd_body[3];
    int bike_rgb[3];
    int num_pieces;
    int pieces[MAX_PIECES];
} TrackDef;

static const TrackDef TRIALS_TRACKS[4] = {
    {"T-1", "BOULDER CREEK CANYON", {2,132,199}, {186,230,253}, {15,118,110}, {21,128,61}, {34,197,94}, {120,53,15}, {249,115,22}, 13,
     {PIECE_FLAT, PIECE_RAMP, PIECE_BOULDERS, PIECE_LOGS, PIECE_TABLETOP, PIECE_BRIDGE, PIECE_WHOOPS, PIECE_MEGA_RAMP, PIECE_BOULDERS, PIECE_LOGS, PIECE_RAMP, PIECE_MEGA_RAMP, PIECE_FLAT}},
    {"T-2", "RED ROCK MESA TRIALS", {194,65,12}, {253,224,71}, {154,52,18}, {180,83,9}, {245,158,11}, {124,45,18}, {239,68,68}, 12,
     {PIECE_FLAT, PIECE_BOULDERS, PIECE_MEGA_RAMP, PIECE_TABLETOP, PIECE_LOGS, PIECE_BOULDERS, PIECE_BRIDGE, PIECE_MEGA_RAMP, PIECE_WHOOPS, PIECE_BOULDERS, PIECE_MEGA_RAMP, PIECE_FLAT}},
    {"T-3", "TIMBERYARD INDUSTRIAL", {30,41,59}, {100,116,139}, {51,65,85}, {71,85,105}, {148,163,184}, {51,65,85}, {234,179,8}, 12,
     {PIECE_FLAT, PIECE_LOGS, PIECE_TABLETOP, PIECE_BOULDERS, PIECE_MEGA_RAMP, PIECE_BRIDGE, PIECE_LOGS, PIECE_WHOOPS, PIECE_TABLETOP, PIECE_MEGA_RAMP, PIECE_LOGS, PIECE_FLAT}},
    {"T-4", "VOLCANO RIM EXTREME", {24,24,27}, {127,29,29}, {69,10,10}, {153,27,27}, {248,113,113}, {39,39,42}, {56,189,248}, 12,
     {PIECE_FLAT, PIECE_MEGA_RAMP, PIECE_BOULDERS, PIECE_BRIDGE, PIECE_MEGA_RAMP, PIECE_WHOOPS, PIECE_BOULDERS, PIECE_LOGS, PIECE_TABLETOP, PIECE_MEGA_RAMP, PIECE_MEGA_RAMP, PIECE_FLAT}}
};

static const TrackDef STADIUM_TRACKS[4] = {
    {"M-1", "EMERALD STADIUM GP", {29,78,216}, {147,197,253}, {30,58,138}, {21,128,61}, {22,163,74}, {146,64,14}, {239,68,68}, 13,
     {PIECE_FLAT, PIECE_RAMP, PIECE_COOL, PIECE_MUD, PIECE_TABLETOP, PIECE_WHOOPS, PIECE_COOL, PIECE_MEGA_RAMP, PIECE_MUD, PIECE_RAMP, PIECE_COOL, PIECE_MEGA_RAMP, PIECE_FLAT}},
    {"M-2", "SUNSET DUNES SUPERCROSS", {124,45,18}, {253,186,116}, {154,52,18}, {217,119,6}, {245,158,11}, {120,53,15}, {16,185,129}, 13,
     {PIECE_FLAT, PIECE_WHOOPS, PIECE_COOL, PIECE_MEGA_RAMP, PIECE_MUD, PIECE_TABLETOP, PIECE_COOL, PIECE_WHOOPS, PIECE_MEGA_RAMP, PIECE_MUD, PIECE_COOL, PIECE_MEGA_RAMP, PIECE_FLAT}},
    {"M-3", "NEON NIGHT ARENA", {9,13,22}, {59,7,100}, {49,46,129}, {88,28,135}, {192,132,252}, {30,27,75}, {56,189,248}, 12,
     {PIECE_FLAT, PIECE_MEGA_RAMP, PIECE_COOL, PIECE_WHOOPS, PIECE_MUD, PIECE_TABLETOP, PIECE_MEGA_RAMP, PIECE_COOL, PIECE_MUD, PIECE_WHOOPS, PIECE_MEGA_RAMP, PIECE_FLAT}},
    {"M-4", "WORLD CHAMPIONSHIP GP", {15,23,42}, {30,64,175}, {30,41,59}, {4,120,87}, {250,204,21}, {124,45,18}, {249,115,22}, 13,
     {PIECE_FLAT, PIECE_MEGA_RAMP, PIECE_WHOOPS, PIECE_COOL, PIECE_MUD, PIECE_MEGA_RAMP, PIECE_TABLETOP, PIECE_COOL, PIECE_WHOOPS, PIECE_MEGA_RAMP, PIECE_COOL, PIECE_MEGA_RAMP, PIECE_FLAT}}
};

static TrackDef custom_track = {
    "C-1", "CUSTOM BUILDER COURSE", {15,23,42}, {2,132,199}, {15,118,110}, {21,128,61}, {74,222,128}, {120,53,15}, {249,115,22}, 10,
    {PIECE_FLAT, PIECE_RAMP, PIECE_COOL, PIECE_BOULDERS, PIECE_MEGA_RAMP, PIECE_TABLETOP, PIECE_LOGS, PIECE_WHOOPS, PIECE_MEGA_RAMP, PIECE_FLAT}
};

typedef struct {
    int active;
    int kind;
    float x, y, r, w;
    int lane;
} Obstacle;

typedef struct {
    float x, y, vx, vy, pitch;
    int lane;
    Color color;
    int crashed;
} Rival;

typedef struct {
    int active;
    float x, y, vx, vy;
    Color color;
    int life;
} Particle;

static SDL_Window *window = NULL;
static SDL_Renderer *renderer = NULL;
static SDL_Texture *tex_circle = NULL;
static SDL_Texture *tex_wheel = NULL;
static SDL_Texture *tex_boulder = NULL;
static SDL_Texture *tex_log = NULL;
static SDL_Texture *tex_bike_body = NULL;

static int game_mode = 0; /* 0 = Trials, 1 = Stadium GP, 2 = Track Builder */
static int current_track = 0;
static int game_state = 0; /* 0 = Title, 1 = Playing, 2 = Finished */
static int global_tick = 0;
static float track_length = 5600.0f;
static float camera_x = 0.0f;
static float camera_y = 0.0f;
static char banner_text[64] = "";
static int banner_timer = 0;
static char popup_text[48] = "";
static int popup_timer = 0;

static Obstacle obstacles[MAX_OBSTACLES];
static Rival rivals[MAX_RIVALS];
static Particle particles[MAX_PARTICLES];

static struct {
    float x, y, vx, vy;
    float pitch, omega;
    int lane;
    float lane_y;
    int on_ground;
    int front_contact, rear_contact;
    float front_comp, rear_comp;
    float wheel_rot;
    float temp;
    int overheated;
    int crashed;
    int air_time;
    float air_rot_accum;
    int wheelie_ticks;
    int score;
    int flips;
    float race_time;
    float checkpoint_x;
} bike;

/* Audio Synthesizer (Continuous Engine Roar + Stunt/Crash SFX) */
static volatile int cur_sfx = SFX_NONE;
static volatile int sfx_pos = 0;
static volatile int sfx_len = 0;
static volatile float eng_freq = 55.0f;
static volatile int eng_active = 0;
static float eng_phase = 0.0f;

static void play_sfx(int id) {
    SDL_LockAudio();
    cur_sfx = id;
    sfx_pos = 0;
    switch (id) {
        case SFX_STUNT:  sfx_len = 4800; break;
        case SFX_COOL:   sfx_len = 4000; break;
        case SFX_CRASH:  sfx_len = 7500; break;
        case SFX_FINISH: sfx_len = 12000; break;
        default:         sfx_len = 0; break;
    }
    SDL_UnlockAudio();
}

static void audio_cb(void *userdata, Uint8 *stream, int len) {
    (void)userdata;
    Sint16 *buf = (Sint16 *)stream;
    int samples = len / 2;
    for (int i = 0; i < samples; i++) {
        int mix = 0;
        if (eng_active) {
            eng_phase += eng_freq / 22050.0f;
            if (eng_phase >= 1.0f) eng_phase -= 1.0f;
            /* Warm 2-stroke/4-stroke dirt bike exhaust waveform */
            float saw = (eng_phase * 2.0f - 1.0f);
            float sub = (fmodf(eng_phase * 0.5f, 1.0f) < 0.5f) ? 1.0f : -1.0f;
            mix += (int)((saw * 0.6f + sub * 0.4f) * 1450.0f);
        }
        if (cur_sfx != SFX_NONE && sfx_pos < sfx_len) {
            float prog = (float)sfx_pos / (float)sfx_len;
            float f = 440.0f;
            int noise = 0;
            if (cur_sfx == SFX_STUNT) f = 440.0f + 520.0f * prog;
            else if (cur_sfx == SFX_COOL) f = 580.0f + 620.0f * prog;
            else if (cur_sfx == SFX_CRASH) noise = 1;
            else if (cur_sfx == SFX_FINISH) {
                static const float notes[4] = {523.0f, 659.0f, 784.0f, 1046.0f};
                int idx = (int)(prog * 4.0f);
                if (idx > 3) idx = 3;
                f = notes[idx];
            }
            if (noise) {
                mix += (int)(((rand() % 6000) - 3000) * (1.0f - prog));
            } else {
                int per = (int)(22050.0f / f);
                if (per < 2) per = 2;
                int sq = ((sfx_pos % per) < (per / 2)) ? 1 : -1;
                mix += (int)(sq * 2400.0f * (1.0f - 0.3f * prog));
            }
            sfx_pos++;
            if (sfx_pos >= sfx_len) cur_sfx = SFX_NONE;
        }
        if (mix > 30000) mix = 30000;
        if (mix < -30000) mix = -30000;
        buf[i] = (Sint16)mix;
    }
}

/* Procedural HD Texture Baker */
static float clampf(float v, float lo, float hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

static void blend_px(Uint32 *px, int w, int h, int x, int y, int r, int g, int b, float a) {
    if (x < 0 || x >= w || y < 0 || y >= h || a <= 0.0f) return;
    a = clampf(a, 0.0f, 1.0f);
    Uint32 dst = px[y * w + x];
    int dr = (dst >> 24) & 0xFF, dg = (dst >> 16) & 0xFF, db = (dst >> 8) & 0xFF, da = dst & 0xFF;
    float fa = da / 255.0f;
    float out_a = a + fa * (1.0f - a);
    if (out_a <= 0.001f) return;
    int nr = (int)((r * a + dr * fa * (1.0f - a)) / out_a);
    int ng = (int)((g * a + dg * fa * (1.0f - a)) / out_a);
    int nb = (int)((b * a + db * fa * (1.0f - a)) / out_a);
    int na = (int)(out_a * 255.0f);
    px[y * w + x] = ((Uint32)(nr & 0xFF) << 24) | ((Uint32)(ng & 0xFF) << 16) |
                    ((Uint32)(nb & 0xFF) << 8)  | (Uint32)(na & 0xFF);
}

static void sdf_ellipse(Uint32 *px, int w, int h, float cx, float cy, float rx, float ry,
                        int r, int g, int b, int outline_px, int shade_3d) {
    int x0 = (int)(cx - rx - outline_px - 2), x1 = (int)(cx + rx + outline_px + 2);
    int y0 = (int)(cy - ry - outline_px - 2), y1 = (int)(cy + ry + outline_px + 2);
    for (int y = y0; y <= y1; y++) {
        for (int x = x0; x <= x1; x++) {
            float dx = (x + 0.5f - cx) / rx;
            float dy = (y + 0.5f - cy) / ry;
            float dist = sqrtf(dx * dx + dy * dy);
            float avg_r = 0.5f * (rx + ry);
            float px_dist = (dist - 1.0f) * avg_r;
            if (outline_px > 0) {
                float oa = clampf(1.0f - (px_dist - outline_px), 0.0f, 1.0f);
                if (oa > 0.0f) blend_px(px, w, h, x, y, 15, 23, 42, oa);
            }
            float ia = clampf(0.5f - px_dist, 0.0f, 1.0f);
            if (ia > 0.0f) {
                int cr = r, cg = g, cb = b;
                if (shade_3d) {
                    float light = clampf(1.18f - 0.38f * (dx * 0.45f + dy * 0.85f), 0.68f, 1.32f);
                    cr = (int)clampf(r * light, 0, 255);
                    cg = (int)clampf(g * light, 0, 255);
                    cb = (int)clampf(b * light, 0, 255);
                }
                blend_px(px, w, h, x, y, cr, cg, cb, ia);
            }
        }
    }
}

static void sdf_round_rect(Uint32 *px, int w, int h, float x0, float y0, float rw, float rh, float rad,
                           int r, int g, int b, int outline_px, int shade_3d) {
    float cx = x0 + rw * 0.5f, cy = y0 + rh * 0.5f;
    float hx = rw * 0.5f - rad, hy = rh * 0.5f - rad;
    for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
            float dx = fabsf(x + 0.5f - cx) - hx;
            float dy = fabsf(y + 0.5f - cy) - hy;
            float ox = dx > 0.0f ? dx : 0.0f, oy = dy > 0.0f ? dy : 0.0f;
            float dist = sqrtf(ox * ox + oy * oy) + (dx > dy ? (dx < 0 ? dx : 0) : (dy < 0 ? dy : 0)) - rad;
            if (outline_px > 0) {
                float oa = clampf(0.5f - (dist - outline_px), 0.0f, 1.0f);
                if (oa > 0.0f) blend_px(px, w, h, x, y, 15, 23, 42, oa);
            }
            float ia = clampf(0.5f - dist, 0.0f, 1.0f);
            if (ia > 0.0f) {
                int cr = r, cg = g, cb = b;
                if (shade_3d) {
                    float ny = (y - y0) / rh;
                    float light = 1.16f - 0.32f * ny;
                    cr = (int)clampf(r * light, 0, 255);
                    cg = (int)clampf(g * light, 0, 255);
                    cb = (int)clampf(b * light, 0, 255);
                }
                blend_px(px, w, h, x, y, cr, cg, cb, ia);
            }
        }
    }
}

static SDL_Texture *make_tex(Uint32 *px, int w, int h) {
    SDL_Surface *s = SDL_CreateRGBSurfaceFrom(px, w, h, 32, w * 4,
                                              0xFF000000, 0x00FF0000, 0x0000FF00, 0x000000FF);
    SDL_Texture *t = SDL_CreateTextureFromSurface(renderer, s);
    SDL_SetTextureBlendMode(t, SDL_BLENDMODE_BLEND);
    SDL_FreeSurface(s);
    free(px);
    return t;
}

static void bake_textures(void) {
    /* Circle */
    {
        int S = 64;
        Uint32 *pc = (Uint32 *)calloc(S * S, 4);
        float c = S * 0.5f, R = S * 0.46f;
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
                blend_px(pc, S, S, x, y, 255, 255, 255, clampf(R - hypotf(x + 0.5f - c, y + 0.5f - c) + 0.5f, 0.0f, 1.0f));
        tex_circle = make_tex(pc, S, S);
    }
    /* Knobby Motocross Wheel (64x64) */
    {
        int S = 64;
        Uint32 *pw = (Uint32 *)calloc(S * S, 4);
        sdf_ellipse(pw, S, S, 32, 32, 27, 27, 30, 41, 59, 2, 1);
        sdf_ellipse(pw, S, S, 32, 32, 17, 17, 226, 232, 240, 2, 1);
        sdf_round_rect(pw, S, S, 16, 29, 32, 6, 2, 100, 116, 139, 0, 0);
        sdf_round_rect(pw, S, S, 29, 16, 6, 32, 2, 100, 116, 139, 0, 0);
        sdf_ellipse(pw, S, S, 32, 32, 6, 6, 249, 115, 22, 1, 1);
        tex_wheel = make_tex(pw, S, S);
    }
    /* Boulder & Timber Log (64x64) */
    {
        int S = 64;
        Uint32 *pb = (Uint32 *)calloc(S * S, 4);
        sdf_ellipse(pb, S, S, 32, 34, 28, 26, 100, 116, 139, 2, 1);
        sdf_ellipse(pb, S, S, 24, 26, 12, 10, 148, 163, 184, 0, 1);
        tex_boulder = make_tex(pb, S, S);

        Uint32 *pl = (Uint32 *)calloc(S * S, 4);
        sdf_ellipse(pl, S, S, 32, 32, 27, 27, 120, 53, 15, 2, 1);
        sdf_ellipse(pl, S, S, 32, 32, 20, 20, 253, 230, 138, 2, 1);
        sdf_ellipse(pl, S, S, 32, 32, 10, 10, 180, 83, 9, 1, 0);
        tex_log = make_tex(pl, S, S);
    }
    /* Articulated Dirt Bike & Motocross Rider Sprite (128x128) */
    {
        int S = 128;
        Uint32 *px = (Uint32 *)calloc(S * S, 4);
        /* Swingarm, Forks & Golden Shock Spring */
        sdf_round_rect(px, S, S, 28, 76, 36, 8, 3, 148, 163, 184, 2, 1);
        sdf_round_rect(px, S, S, 44, 62, 10, 22, 3, 250, 204, 21, 1, 1);
        sdf_round_rect(px, S, S, 76, 52, 10, 38, 3, 226, 232, 240, 2, 1);
        /* Engine Block & Chrome Exhaust */
        sdf_round_rect(px, S, S, 50, 64, 28, 22, 5, 71, 85, 105, 2, 1);
        sdf_round_rect(px, S, S, 26, 62, 36, 8, 3, 226, 232, 240, 1, 1);
        /* Motocross Chassis & Fenders (White base so SDL_SetTextureColorMod tints it!) */
        sdf_round_rect(px, S, S, 26, 52, 68, 16, 7, 255, 255, 255, 2, 1);
        /* Rider Boots, Jersey, Arms & Helmet */
        sdf_round_rect(px, S, S, 46, 44, 14, 24, 5, 30, 41, 59, 2, 1);
        sdf_round_rect(px, S, S, 44, 22, 22, 26, 8, 255, 255, 255, 2, 1);
        sdf_round_rect(px, S, S, 56, 30, 26, 8, 4, 253, 224, 71, 1, 1);
        sdf_ellipse(px, S, S, 58, 14, 13, 12, 248, 250, 252, 2, 1);
        sdf_round_rect(px, S, S, 62, 10, 10, 7, 2, 56, 189, 248, 1, 0);
        tex_bike_body = make_tex(px, S, S);
    }
}

/* 5x7 Pixel Font with HD Drop Shadow */
static const unsigned char font5x7[96][7] = {
    [' ' - 32] = {0,0,0,0,0,0,0},
    ['!' - 32] = {4,4,4,4,4,0,4},
    ['+' - 32] = {0,4,4,31,4,4,0},
    ['-' - 32] = {0,0,0,31,0,0,0},
    ['.' - 32] = {0,0,0,0,0,0,4},
    ['/' - 32] = {1,1,2,4,8,16,16},
    ['0' - 32] = {14,17,19,21,25,17,14},
    ['1' - 32] = {4,12,4,4,4,4,14},
    ['2' - 32] = {14,17,1,6,8,16,31},
    ['3' - 32] = {31,2,4,6,1,17,14},
    ['4' - 32] = {2,6,10,18,31,2,2},
    ['5' - 32] = {31,16,30,1,1,17,14},
    ['6' - 32] = {6,8,16,30,17,17,14},
    ['7' - 32] = {31,1,2,4,8,8,8},
    ['8' - 32] = {14,17,17,14,17,17,14},
    ['9' - 32] = {14,17,17,15,1,2,12},
    [':' - 32] = {0,4,4,0,4,4,0},
    ['<' - 32] = {2,4,8,16,8,4,2},
    ['=' - 32] = {0,0,31,0,31,0,0},
    ['>' - 32] = {8,4,2,1,2,4,8},
    ['?' - 32] = {14,17,1,2,4,0,4},
    ['A' - 32] = {14,17,17,31,17,17,17},
    ['B' - 32] = {30,17,17,30,17,17,30},
    ['C' - 32] = {14,17,16,16,16,17,14},
    ['D' - 32] = {28,18,17,17,17,18,28},
    ['E' - 32] = {31,16,16,30,16,16,31},
    ['F' - 32] = {31,16,16,30,16,16,16},
    ['G' - 32] = {14,17,16,23,17,17,15},
    ['H' - 32] = {17,17,17,31,17,17,17},
    ['I' - 32] = {14,4,4,4,4,4,14},
    ['J' - 32] = {7,2,2,2,2,18,12},
    ['K' - 32] = {17,18,20,24,20,18,17},
    ['L' - 32] = {16,16,16,16,16,16,31},
    ['M' - 32] = {17,27,21,21,17,17,17},
    ['N' - 32] = {17,17,25,21,19,17,17},
    ['O' - 32] = {14,17,17,17,17,17,14},
    ['P' - 32] = {30,17,17,30,16,16,16},
    ['Q' - 32] = {14,17,17,17,21,18,13},
    ['R' - 32] = {30,17,17,30,20,18,17},
    ['S' - 32] = {15,16,16,14,1,1,30},
    ['T' - 32] = {31,4,4,4,4,4,4},
    ['U' - 32] = {17,17,17,17,17,17,14},
    ['V' - 32] = {17,17,17,17,17,10,4},
    ['W' - 32] = {17,17,17,21,21,21,10},
    ['X' - 32] = {17,17,10,4,10,17,17},
    ['Y' - 32] = {17,17,17,10,4,4,4},
    ['Z' - 32] = {31,1,2,4,8,16,31}
};

static void draw_text_raw(int x, int y, const char *s, Color col, int scale) {
    SDL_SetRenderDrawColor(renderer, col.r, col.g, col.b, col.a);
    int cx = x;
    while (*s) {
        char c = *s++;
        if (c >= 'a' && c <= 'z') c -= 32;
        if (c >= 32 && c < 128) {
            const unsigned char *g = font5x7[c - 32];
            for (int r = 0; r < 7; r++) {
                for (int col_i = 0; col_i < 5; col_i++) {
                    if (g[r] & (1 << (4 - col_i))) {
                        SDL_Rect rc = {cx + col_i * scale, y + r * scale, scale, scale};
                        SDL_RenderFillRect(renderer, &rc);
                    }
                }
            }
        }
        cx += 6 * scale;
    }
}

static void draw_text_hd(int x, int y, const char *s, Color col, int scale) {
    draw_text_raw(x + 2, y + 2, s, rgba(2, 6, 23, 220), scale);
    draw_text_raw(x, y, s, col, scale);
}

static void fill_rect(int x, int y, int w, int h, Color c) {
    SDL_SetRenderDrawColor(renderer, c.r, c.g, c.b, c.a);
    SDL_Rect r = {x, y, w, h};
    SDL_RenderFillRect(renderer, &r);
}

static void draw_tex(SDL_Texture *t, float x, float y, float w, float h, float angle_deg, Color tint) {
    if (!t) return;
    SDL_SetTextureColorMod(t, tint.r, tint.g, tint.b);
    SDL_SetTextureAlphaMod(t, tint.a);
    SDL_Rect dst = {(int)(x + 0.5f), (int)(y + 0.5f), (int)(w + 0.5f), (int)(h + 0.5f)};
    SDL_RenderCopyEx(renderer, t, NULL, &dst, (double)angle_deg, NULL, SDL_FLIP_NONE);
}

static const TrackDef *active_track(void) {
    if (game_mode == 2) return &custom_track;
    if (game_mode == 1) return &STADIUM_TRACKS[current_track % 4];
    return &TRIALS_TRACKS[current_track % 4];
}

static float base_terrain_y(float x) {
    const TrackDef *tr = active_track();
    float base = 520.0f;
    if (x < 300.0f) return base;
    int idx = (int)((x - 300.0f) / SEG_LEN);
    if (idx < 0 || idx >= tr->num_pieces) return base;
    float u = ((x - 300.0f) - idx * SEG_LEN) / SEG_LEN;
    int p = tr->pieces[idx];

    if (p == PIECE_RAMP) {
        if (u > 0.25f && u < 0.72f) return base - sinf(((u - 0.25f) / 0.47f) * PI) * 95.0f;
    } else if (p == PIECE_MEGA_RAMP) {
        if (u > 0.15f && u < 0.55f) return base - sinf(((u - 0.15f) / 0.40f) * PI * 0.5f) * 165.0f;
        else if (u >= 0.55f && u < 0.75f) return base + 32.0f;
        else if (u >= 0.75f && u < 0.96f) return base - sinf((1.0f - (u - 0.75f) / 0.21f) * PI * 0.5f) * 125.0f;
    } else if (p == PIECE_TABLETOP) {
        if (u > 0.15f && u < 0.35f) return base - ((u - 0.15f) / 0.20f) * 120.0f;
        else if (u >= 0.35f && u <= 0.68f) return base - 120.0f;
        else if (u > 0.68f && u < 0.88f) return base - (1.0f - (u - 0.68f) / 0.20f) * 120.0f;
    } else if (p == PIECE_WHOOPS) {
        if (u > 0.1f && u < 0.9f) return base - fabsf(sinf(((u - 0.1f) / 0.8f) * PI * 5.0f)) * 45.0f;
    } else if (p == PIECE_BRIDGE) {
        if (u > 0.12f && u < 0.88f) return base - sinf(((u - 0.12f) / 0.76f) * PI) * 105.0f;
    }
    return base;
}

static float get_ground_y(float x) {
    float y = base_terrain_y(x);
    for (int i = 0; i < MAX_OBSTACLES; i++) {
        if (!obstacles[i].active) continue;
        if (obstacles[i].kind == OB_BOULDER || obstacles[i].kind == OB_LOG) {
            float dx = x - obstacles[i].x;
            if (fabsf(dx) < obstacles[i].r) {
                float bump = sqrtf(obstacles[i].r * obstacles[i].r - dx * dx);
                float oy = obstacles[i].y - bump * 0.9f;
                if (oy < y) y = oy;
            }
        }
    }
    return y;
}

static float get_slope(float x) {
    return atan2f(get_ground_y(x + 8.0f) - get_ground_y(x - 8.0f), 16.0f);
}

static void add_obstacle(int kind, float x, float y, float r, float w, int lane) {
    for (int i = 0; i < MAX_OBSTACLES; i++) {
        if (!obstacles[i].active) {
            obstacles[i].active = 1;
            obstacles[i].kind = kind;
            obstacles[i].x = x;
            obstacles[i].y = y;
            obstacles[i].r = r;
            obstacles[i].w = w;
            obstacles[i].lane = lane;
            return;
        }
    }
}

static void reset_bike(int from_cp) {
    bike.x = from_cp ? bike.checkpoint_x : 180.0f;
    bike.y = get_ground_y(bike.x) - 26.0f;
    bike.vx = 0;
    bike.vy = 0;
    bike.pitch = 0;
    bike.omega = 0;
    bike.lane = 1;
    bike.lane_y = 1.0f;
    bike.on_ground = 1;
    bike.temp = 25.0f;
    bike.overheated = 0;
    bike.crashed = 0;
    bike.air_time = 0;
    bike.air_rot_accum = 0;
    bike.wheelie_ticks = 0;
    if (!from_cp) {
        bike.score = 0;
        bike.flips = 0;
        bike.race_time = 0;
        bike.checkpoint_x = 180.0f;
    }
    camera_x = bike.x - 280.0f;
    if (camera_x < 0) camera_x = 0;
}

static void build_track(void) {
    const TrackDef *tr = active_track();
    memset(obstacles, 0, sizeof(obstacles));
    memset(particles, 0, sizeof(particles));
    track_length = 300.0f + tr->num_pieces * SEG_LEN + 400.0f;

    for (int i = 0; i < tr->num_pieces; i++) {
        float sx = 300.0f + i * SEG_LEN;
        int p = tr->pieces[i];
        if (p == PIECE_BOULDERS) {
            float rs[4] = {24.0f, 32.0f, 28.0f, 22.0f};
            for (int k = 0; k < 4; k++) {
                float bx = sx + 95.0f + k * 46.0f;
                add_obstacle(OB_BOULDER, bx, base_terrain_y(bx), rs[k], 0, 0);
            }
        } else if (p == PIECE_LOGS) {
            for (int k = 0; k < 3; k++) {
                float lx = sx + 115.0f + k * 54.0f;
                add_obstacle(OB_LOG, lx, base_terrain_y(lx), 26.0f, 0, 0);
            }
        } else if (p == PIECE_MUD) {
            add_obstacle(OB_MUD, sx + 110.0f, 0, 0, 150.0f, i % 4);
            add_obstacle(OB_MUD, sx + 220.0f, 0, 0, 120.0f, (i + 2) % 4);
        } else if (p == PIECE_COOL) {
            add_obstacle(OB_COOL, sx + 150.0f, 0, 0, 0, (i * 2) % 4);
            add_obstacle(OB_COOL, sx + 260.0f, 0, 0, 0, (i * 2 + 1) % 4);
        }
        if (p == PIECE_MEGA_RAMP || p == PIECE_RAMP || p == PIECE_TABLETOP) {
            add_obstacle(OB_STAR, sx + SEG_LEN * 0.5f, base_terrain_y(sx + SEG_LEN * 0.5f) - 125.0f, 18.0f, 0, 0);
        }
    }

    Color rcols[4] = {rgb(56,189,248), rgb(250,204,21), rgb(168,85,247), rgb(34,197,94)};
    for (int i = 0; i < MAX_RIVALS; i++) {
        rivals[i].x = 240.0f + i * 70.0f;
        rivals[i].y = 500.0f;
        rivals[i].vx = 5.6f + i * 0.3f;
        rivals[i].vy = 0;
        rivals[i].pitch = 0;
        rivals[i].lane = i;
        rivals[i].color = rcols[i];
        rivals[i].crashed = 0;
    }

    reset_bike(0);
    snprintf(banner_text, sizeof(banner_text), "%s: %s", tr->code, tr->name);
    banner_timer = 120;
}

static Uint8 keys_held[SDL_NUM_SCANCODES];
static Uint8 prev_held[SDL_NUM_SCANCODES];

static void update_game(void) {
    global_tick++;
    if (banner_timer > 0) banner_timer--;
    if (popup_timer > 0) popup_timer--;

    int k_gas   = keys_held[SDL_SCANCODE_RIGHT] || keys_held[SDL_SCANCODE_D] || keys_held[SDL_SCANCODE_SPACE];
    int k_turbo = keys_held[SDL_SCANCODE_Z] || keys_held[SDL_SCANCODE_LSHIFT] || keys_held[SDL_SCANCODE_RSHIFT];
    int k_brake = keys_held[SDL_SCANCODE_LEFT] || keys_held[SDL_SCANCODE_A];
    int k_up    = keys_held[SDL_SCANCODE_UP] || keys_held[SDL_SCANCODE_W];
    int p_up    = prev_held[SDL_SCANCODE_UP] || prev_held[SDL_SCANCODE_W];
    int k_down  = keys_held[SDL_SCANCODE_DOWN] || keys_held[SDL_SCANCODE_S];
    int p_down  = prev_held[SDL_SCANCODE_DOWN] || prev_held[SDL_SCANCODE_S];

    /* Switch Mode with M or Tab */
    if ((keys_held[SDL_SCANCODE_TAB] && !prev_held[SDL_SCANCODE_TAB]) ||
        (keys_held[SDL_SCANCODE_M] && !prev_held[SDL_SCANCODE_M])) {
        game_mode = (game_mode + 1) % 3;
        build_track();
        play_sfx(SFX_COOL);
    }

    if (game_state == 0 || game_state == 2) {
        eng_active = 0;
        if (keys_held[SDL_SCANCODE_LEFT] && !prev_held[SDL_SCANCODE_LEFT]) {
            current_track = (current_track + 3) % 4;
            build_track();
            play_sfx(SFX_COOL);
        }
        if (keys_held[SDL_SCANCODE_RIGHT] && !prev_held[SDL_SCANCODE_RIGHT]) {
            current_track = (current_track + 1) % 4;
            build_track();
            play_sfx(SFX_COOL);
        }
        if ((keys_held[SDL_SCANCODE_RETURN] && !prev_held[SDL_SCANCODE_RETURN]) ||
            (keys_held[SDL_SCANCODE_SPACE] && !prev_held[SDL_SCANCODE_SPACE])) {
            game_state = 1;
            reset_bike(0);
        }
        return;
    }

    if (bike.crashed > 0) {
        eng_active = 0;
        bike.crashed--;
        if (bike.crashed == 0) reset_bike(1);
        return;
    }

    bike.race_time += 1.0f / 60.0f;

    if (game_mode == 1 && bike.on_ground) {
        if (k_up && !p_up && bike.lane > 0) bike.lane--;
        if (k_down && !p_down && bike.lane < 3) bike.lane++;
    }
    bike.lane_y += (bike.lane - bike.lane_y) * 0.18f;

    int using_turbo = (k_turbo && bike.overheated == 0);
    if (bike.overheated > 0) {
        bike.overheated--;
        bike.temp -= 0.55f;
        if (bike.temp < 30.0f) bike.temp = 30.0f;
    } else if (using_turbo) {
        bike.temp += 0.34f;
        if (bike.temp >= 100.0f) {
            bike.temp = 100.0f;
            bike.overheated = 130;
            snprintf(banner_text, sizeof(banner_text), "ENGINE OVERHEATED! HIT >>> ARROWS!");
            banner_timer = 90;
            play_sfx(SFX_CRASH);
        }
    } else {
        bike.temp -= 0.22f;
        if (bike.temp < 22.0f) bike.temp = 22.0f;
    }

    float wb = 32.0f;
    float rx = bike.x - cosf(bike.pitch) * wb;
    float ry = bike.y - sinf(bike.pitch) * wb;
    float fx = bike.x + cosf(bike.pitch) * wb;
    float fy = bike.y + sinf(bike.pitch) * wb;
    float g_rear = get_ground_y(rx) - 16.0f;
    float g_front = get_ground_y(fx) - 16.0f;

    bike.rear_contact = (ry >= g_rear - 5.0f);
    bike.front_contact = (fy >= g_front - 5.0f);
    bike.on_ground = (bike.rear_contact || bike.front_contact);

    float slope = get_slope(bike.x);
    int in_mud = 0;

    for (int i = 0; i < MAX_OBSTACLES; i++) {
        Obstacle *ob = &obstacles[i];
        if (!ob->active) continue;
        if (ob->kind == OB_MUD && fabsf(bike.x - (ob->x + ob->w * 0.5f)) < ob->w * 0.5f) {
            if (game_mode != 1 || ob->lane == bike.lane) in_mud = 1;
        } else if (ob->kind == OB_COOL && fabsf(bike.x - ob->x) < 32.0f) {
            if (game_mode != 1 || ob->lane == bike.lane) {
                if (bike.temp > 25.0f || bike.overheated > 0) {
                    bike.temp = 20.0f;
                    bike.overheated = 0;
                    if (bike.vx < 9.8f) bike.vx = 9.8f;
                    play_sfx(SFX_COOL);
                    snprintf(popup_text, sizeof(popup_text), "COOL TURBO BOOST!");
                    popup_timer = 55;
                }
            }
        } else if (ob->kind == OB_STAR) {
            if (hypotf(bike.x - ob->x, bike.y - ob->y) < 44.0f) {
                ob->active = 0;
                bike.score += 500;
                play_sfx(SFX_STUNT);
                snprintf(popup_text, sizeof(popup_text), "+500 STAR RING!");
                popup_timer = 55;
            }
        }
    }

    if (bike.x > bike.checkpoint_x + 900.0f) {
        bike.checkpoint_x = bike.x;
        play_sfx(SFX_COOL);
        snprintf(popup_text, sizeof(popup_text), "CHECKPOINT SAVED!");
        popup_timer = 55;
    }

    float max_s = (bike.overheated > 0) ? 2.5f : (in_mud ? 3.8f : (using_turbo ? 11.2f : 8.4f));
    float acc = using_turbo ? 0.32f : 0.22f;

    if (bike.on_ground) {
        if (bike.air_time > 18) {
            float diff = fabsf(atan2f(sinf(bike.pitch - slope), cosf(bike.pitch - slope)));
            if (diff < 0.38f) {
                bike.score += 500;
                bike.vx += 1.2f;
                play_sfx(SFX_STUNT);
                snprintf(popup_text, sizeof(popup_text), "+500 PERFECT LANDING!");
                popup_timer = 60;
            } else if (diff > 1.45f) {
                bike.crashed = 55;
                play_sfx(SFX_CRASH);
                snprintf(banner_text, sizeof(banner_text), "WIPEOUT! RESPAWNING AT CHECKPOINT...");
                banner_timer = 55;
                return;
            }
        }
        bike.air_time = 0;
        bike.air_rot_accum = 0;

        if (k_gas && bike.overheated == 0) {
            bike.vx += acc * cosf(slope);
            if (bike.vx > max_s) bike.vx = max_s;
            if (using_turbo && game_mode != 1) bike.omega -= 0.004f;
        } else if (k_brake) {
            bike.vx -= 0.25f;
            if (bike.vx < -2.5f) bike.vx = -2.5f;
        } else {
            bike.vx *= in_mud ? 0.88f : 0.975f;
        }

        bike.vx += sinf(slope) * 0.16f;
        if (game_mode != 1 && k_up) bike.omega -= 0.013f;
        else if (game_mode != 1 && k_down) bike.omega += 0.013f;
        else bike.omega += (slope - bike.pitch) * 0.16f;
        bike.omega *= 0.80f;
        bike.pitch += bike.omega;

        if (bike.rear_contact && !bike.front_contact && bike.pitch < slope - 0.22f && bike.vx > 2.5f) {
            bike.wheelie_ticks++;
            if (bike.wheelie_ticks % 45 == 0) {
                bike.score += 250;
                snprintf(popup_text, sizeof(popup_text), "+250 WHEELIE BONUS!");
                popup_timer = 50;
            }
        } else {
            bike.wheelie_ticks = 0;
        }

        float gc = (g_rear + g_front) * 0.5f;
        if (bike.y > gc) {
            float l_slope = get_slope(bike.x - 6.0f);
            bike.y = gc;
            if (l_slope < -0.14f && bike.vx > 3.5f) {
                bike.vy = sinf(l_slope) * bike.vx * 1.18f;
            } else {
                bike.vy = 0;
            }
        }
    } else {
        bike.air_time++;
        bike.vy += 0.29f;
        if (k_up) bike.omega -= 0.016f;
        else if (k_down) bike.omega += 0.016f;
        bike.omega *= 0.95f;
        bike.pitch += bike.omega;
        bike.air_rot_accum += bike.omega;

        if (fabsf(bike.air_rot_accum) >= PI * 1.85f) {
            int back = (bike.air_rot_accum < 0);
            bike.flips++;
            bike.score += 1000;
            bike.air_rot_accum = 0;
            play_sfx(SFX_STUNT);
            snprintf(popup_text, sizeof(popup_text), back ? "+1000 BACKFLIP!" : "+1000 FRONTFLIP!");
            popup_timer = 65;
        }
    }

    bike.x += bike.vx;
    bike.y += bike.vy;
    bike.wheel_rot += bike.vx * 5.2f;

    /* Head crash check */
    float hx = bike.x + sinf(bike.pitch) * 30.0f;
    float hy = bike.y - cosf(bike.pitch) * 30.0f;
    if (hy >= get_ground_y(hx) - 4.0f) {
        bike.crashed = 55;
        play_sfx(SFX_CRASH);
        snprintf(banner_text, sizeof(banner_text), "RIDER DOWN! RESPAWNING...");
        banner_timer = 55;
        return;
    }

    if (game_mode == 1) {
        for (int i = 0; i < MAX_RIVALS; i++) {
            Rival *rv = &rivals[i];
            if (rv->crashed > 0) { rv->crashed--; continue; }
            rv->x += rv->vx;
            float gy = get_ground_y(rv->x) - 16.0f;
            if (rv->y < gy) { rv->vy += 0.28f; rv->y += rv->vy; }
            else { rv->y = gy; rv->vy = 0; rv->pitch = get_slope(rv->x); }
            if (fabsf(bike.lane_y - rv->lane) < 0.55f && fabsf(bike.x - rv->x) < 42.0f && fabsf(bike.y - rv->y) < 36.0f) {
                if (bike.x >= rv->x) {
                    rv->crashed = 60;
                    bike.score += 400;
                    play_sfx(SFX_STUNT);
                    snprintf(popup_text, sizeof(popup_text), "+400 RIVAL TAKEDOWN!");
                    popup_timer = 55;
                } else {
                    bike.vx *= 0.6f;
                }
            }
        }
    }

    if (bike.x >= track_length - 220.0f) {
        game_state = 2;
        bike.score += 2500;
        play_sfx(SFX_FINISH);
        snprintf(banner_text, sizeof(banner_text), "FINISH LINE CROSSED! COURSE COMPLETE!");
        banner_timer = 150;
    }

    float target_cx = bike.x - 300.0f + bike.vx * 10.0f;
    if (target_cx < 0) target_cx = 0;
    camera_x += (target_cx - camera_x) * 0.14f;

    eng_active = 1;
    eng_freq = 48.0f + (fabsf(bike.vx) / 10.0f) * (using_turbo ? 160.0f : 110.0f);
}

static void render_bike_hd(float x, float y, float pitch_rad, Color col, float w_rot, int turbo) {
    float deg = pitch_rad * (180.0f / PI);
    float wb = 32.0f;
    float c = cosf(pitch_rad), s = sinf(pitch_rad);
    if (turbo) {
        draw_tex(tex_circle, x - c * 42.0f - 14.0f, y - s * 42.0f - 10.0f, 28.0f, 16.0f, deg, rgb(249, 115, 22));
    }
    draw_tex(tex_wheel, x - c * wb - 17.0f, y - s * wb - 9.0f, 34.0f, 34.0f, w_rot, rgb(255, 255, 255));
    draw_tex(tex_wheel, x + c * wb - 17.0f, y + s * wb - 9.0f, 34.0f, 34.0f, w_rot, rgb(255, 255, 255));
    draw_tex(tex_bike_body, x - 44.0f, y - 56.0f, 88.0f, 88.0f, deg, col);
}

static void render_frame(void) {
    const TrackDef *tr = active_track();

    /* 1. Sky Gradient */
    for (int y = 0; y < 72; y++) {
        float t = (float)y / 72.0f;
        int r = (int)(tr->sky_top[0] + (tr->sky_bot[0] - tr->sky_top[0]) * t);
        int g = (int)(tr->sky_top[1] + (tr->sky_bot[1] - tr->sky_top[1]) * t);
        int b = (int)(tr->sky_top[2] + (tr->sky_bot[2] - tr->sky_top[2]) * t);
        fill_rect(0, y * 10, HD_W, 10, rgb(r, g, b));
    }
    draw_tex(tex_circle, 1020, 80, 90, 90, 0, rgba(254, 240, 138, 220));

    /* 2. Parallax Hills */
    Color hf = rgb(tr->hill_far[0], tr->hill_far[1], tr->hill_far[2]);
    Color hn = rgb(tr->hill_near[0], tr->hill_near[1], tr->hill_near[2]);
    for (int i = -1; i < 6; i++) {
        float hx = i * 320.0f - fmodf(camera_x * 0.2f, 320.0f);
        draw_tex(tex_circle, hx, 360, 340, 340, 0, hf);
        float nx = i * 260.0f - fmodf(camera_x * 0.35f, 260.0f);
        draw_tex(tex_circle, nx, 430, 280, 280, 0, hn);
    }

    /* 3. Terrain Heightmap Columns */
    Color g_top = rgb(tr->gnd_top[0], tr->gnd_top[1], tr->gnd_top[2]);
    Color g_bod = rgb(tr->gnd_body[0], tr->gnd_body[1], tr->gnd_body[2]);
    for (int sx = 0; sx < HD_W; sx += 4) {
        int gy = (int)base_terrain_y(sx + camera_x);
        fill_rect(sx, gy, 4, HD_H - gy, g_bod);
        fill_rect(sx, gy, 4, 10, g_top);
        if (game_mode == 1) {
            for (int l = 0; l < 4; l++) {
                fill_rect(sx, gy + 12 + l * 18, 4, 2, rgba(255, 255, 255, 45));
            }
        }
    }

    /* 4. Obstacles */
    for (int i = 0; i < MAX_OBSTACLES; i++) {
        Obstacle *ob = &obstacles[i];
        if (!ob->active) continue;
        float sx = ob->x - camera_x;
        if (sx < -200 || sx > HD_W + 200) continue;
        if (ob->kind == OB_BOULDER) {
            draw_tex(tex_boulder, sx - ob->r, ob->y - ob->r * 1.1f, ob->r * 2.0f, ob->r * 2.0f, 0, rgb(255, 255, 255));
        } else if (ob->kind == OB_LOG) {
            draw_tex(tex_log, sx - ob->r, ob->y - ob->r * 1.1f, ob->r * 2.0f, ob->r * 2.0f, 0, rgb(255, 255, 255));
        } else if (ob->kind == OB_MUD) {
            int my = (int)base_terrain_y(ob->x) + (game_mode == 1 ? ob->lane * 18 : 0);
            fill_rect((int)sx, my - 3, (int)ob->w, 14, rgb(69, 26, 3));
        } else if (ob->kind == OB_COOL) {
            int cy = (int)base_terrain_y(ob->x) + (game_mode == 1 ? ob->lane * 18 : 0);
            fill_rect((int)sx - 20, cy - 6, 40, 12, rgb(56, 189, 248));
            draw_text_hd((int)sx - 14, cy - 5, ">>>", rgb(255, 255, 255), 1);
        } else if (ob->kind == OB_STAR) {
            draw_tex(tex_circle, sx - 16, ob->y - 16, 32, 32, 0, rgb(250, 204, 21));
        }
    }

    /* Finish Gate */
    int fx = (int)(track_length - 220.0f - camera_x);
    if (fx > -100 && fx < HD_W + 100) {
        int fy = (int)base_terrain_y(track_length - 220.0f);
        fill_rect(fx, fy - 120, 8, 120, rgb(248, 250, 252));
        fill_rect(fx - 40, fy - 120, 90, 26, rgb(250, 204, 21));
        draw_text_hd(fx - 26, fy - 114, "FINISH", rgb(15, 23, 42), 2);
    }

    /* 5. Rivals & Player Dirt Bike */
    if (game_mode == 1) {
        for (int i = 0; i < MAX_RIVALS; i++) {
            Rival *rv = &rivals[i];
            render_bike_hd(rv->x - camera_x, rv->y + rv->lane * 18.0f, rv->pitch, rv->color, global_tick * 12.0f, 0);
        }
    }

    float p_lane_off = (game_mode == 1) ? (bike.lane_y * 18.0f) : 0.0f;
    int is_turbo = (keys_held[SDL_SCANCODE_Z] || keys_held[SDL_SCANCODE_LSHIFT]) && bike.overheated == 0;
    render_bike_hd(bike.x - camera_x, bike.y + p_lane_off, bike.pitch,
                   rgb(tr->bike_rgb[0], tr->bike_rgb[1], tr->bike_rgb[2]), bike.wheel_rot, is_turbo);

    /* 6. HD Top HUD */
    fill_rect(16, 12, HD_W - 32, 52, rgba(15, 23, 42, 230));
    char hud[160];
    snprintf(hud, sizeof(hud), "%s: %s   SPEED:%02d MPH   SCORE:%06d   FLIPS:%d   TIME:%.1fs",
             tr->code, tr->name, (int)(fabsf(bike.vx) * 8.5f), bike.score, bike.flips, bike.race_time);
    draw_text_hd(32, 22, hud, rgb(250, 204, 21), 2);

    const char *m_str = (game_mode == 0) ? "MODE: TRIALS STUNT (TAB=SWITCH MODE)" :
                        (game_mode == 1) ? "MODE: 4-LANE STADIUM GP (TAB=SWITCH)" :
                                           "MODE: TRACK BUILDER (KEYS 1-0 ADD PIECE)";
    draw_text_hd(32, 44, m_str, rgb(56, 189, 248), 2);

    /* Engine Temp Gauge */
    draw_text_hd(980, 20, bike.overheated > 0 ? "OVERHEATED!" : "TEMP (Z=TURBO)", rgb(248, 250, 252), 2);
    fill_rect(980, 38, 260, 16, rgb(30, 41, 59));
    Color tc = (bike.temp > 80.0f) ? rgb(239, 68, 68) : (bike.temp > 55.0f ? rgb(249, 115, 22) : rgb(34, 197, 94));
    fill_rect(982, 40, (int)((bike.temp / 100.0f) * 256.0f), 12, tc);

    if (popup_timer > 0) {
        draw_text_hd((int)(bike.x - camera_x - 60), (int)(bike.y - 75), popup_text, rgb(74, 222, 128), 2);
    }

    if (banner_timer > 0) {
        fill_rect(HD_W / 2 - 280, 80, 560, 36, rgba(15, 23, 42, 230));
        draw_text_hd(HD_W / 2 - 250, 90, banner_text, rgb(250, 204, 21), 2);
    }

    if (game_state == 0 || game_state == 2) {
        fill_rect(HD_W / 2 - 380, HD_H / 2 - 170, 760, 340, rgba(9, 13, 22, 240));
        fill_rect(HD_W / 2 - 380, HD_H / 2 - 170, 760, 4, rgb(249, 115, 22));
        draw_text_hd(HD_W / 2 - 270, HD_H / 2 - 135, "SUPER DIRT BIKE HD: MOTOCROSS & TRIALS", rgb(250, 204, 21), 3);
        draw_text_hd(HD_W / 2 - 260, HD_H / 2 - 80,  "TRIALS STUNT PHYSICS + 4-LANE EXCITEBIKE GP + BUILDER", rgb(56, 189, 248), 2);
        draw_text_hd(HD_W / 2 - 250, HD_H / 2 - 35,  "RIGHT/SPACE = GAS    Z/SHIFT = TURBO    LEFT = BRAKE", rgb(248, 250, 252), 2);
        draw_text_hd(HD_W / 2 - 250, HD_H / 2 + 0,   "UP/DOWN = LEAN & BACKFLIP (TRIALS) / SWITCH LANE (GP)", rgb(248, 250, 252), 2);
        draw_text_hd(HD_W / 2 - 250, HD_H / 2 + 35,  "TAB / M = SWITCH MODE (TRIALS / STADIUM / BUILDER)", rgb(74, 222, 128), 2);
        draw_text_hd(HD_W / 2 - 210, HD_H / 2 + 95,  "PRESS ENTER OR SPACE TO START RIDING!", rgb(251, 191, 36), 2);
    }

    SDL_RenderPresent(renderer);
}

int main(int argc, char **argv) {
    (void)argc; (void)argv;
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO | SDL_INIT_JOYSTICK | SDL_INIT_GAMECONTROLLER) < 0) return 1;
    SDL_SetHint(SDL_HINT_RENDER_SCALE_QUALITY, "1");
    SDL_ShowCursor(SDL_DISABLE);
    if (SDL_NumJoysticks() > 0) SDL_JoystickOpen(0);

    window = SDL_CreateWindow("Super Dirt Bike HD", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
                              HD_W, HD_H, SDL_WINDOW_FULLSCREEN_DESKTOP | SDL_WINDOW_SHOWN);
    if (!window) window = SDL_CreateWindow("Super Dirt Bike HD", 0, 0, HD_W, HD_H, SDL_WINDOW_FULLSCREEN);
    renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
    if (!renderer) renderer = SDL_CreateRenderer(window, -1, 0);
    SDL_RenderSetLogicalSize(renderer, HD_W, HD_H);
    SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_BLEND);

    bake_textures();

    SDL_AudioSpec want;
    memset(&want, 0, sizeof(want));
    want.freq = 22050;
    want.format = AUDIO_S16SYS;
    want.channels = 1;
    want.samples = 512;
    want.callback = audio_cb;
    if (SDL_OpenAudio(&want, NULL) >= 0) SDL_PauseAudio(0);

    build_track();

    int running = 1;
    Uint32 last = SDL_GetTicks();
    while (running) {
        memcpy(prev_held, keys_held, sizeof(keys_held));
        SDL_Event ev;
        while (SDL_PollEvent(&ev)) {
            if (ev.type == SDL_QUIT) running = 0;
            else if (ev.type == SDL_KEYDOWN) {
                SDL_Scancode sc = ev.key.keysym.scancode;
                if (sc == SDL_SCANCODE_ESCAPE) {
                    if (game_state == 0) running = 0;
                    else game_state = 0;
                }
                if (game_mode == 2 && sc >= SDL_SCANCODE_1 && sc <= SDL_SCANCODE_0 && custom_track.num_pieces < MAX_PIECES - 1) {
                    int piece = sc - SDL_SCANCODE_1;
                    custom_track.pieces[custom_track.num_pieces - 1] = piece;
                    custom_track.pieces[custom_track.num_pieces++] = PIECE_FLAT;
                    build_track();
                    play_sfx(SFX_COOL);
                }
                if (sc < SDL_NUM_SCANCODES) keys_held[sc] = 1;
            } else if (ev.type == SDL_KEYUP) {
                SDL_Scancode sc = ev.key.keysym.scancode;
                if (sc < SDL_NUM_SCANCODES) keys_held[sc] = 0;
            } else if (ev.type == SDL_JOYBUTTONDOWN || ev.type == SDL_JOYBUTTONUP) {
                int down = (ev.type == SDL_JOYBUTTONDOWN) ? 1 : 0;
                if (ev.jbutton.button == 0 || ev.jbutton.button == 1) keys_held[SDL_SCANCODE_SPACE] = down;
                else if (ev.jbutton.button == 2 || ev.jbutton.button == 3) keys_held[SDL_SCANCODE_Z] = down;
                else if (ev.jbutton.button == 4 || ev.jbutton.button == 5) keys_held[SDL_SCANCODE_TAB] = down;
                else if (ev.jbutton.button == 7 || ev.jbutton.button == 9) keys_held[SDL_SCANCODE_RETURN] = down;
            } else if (ev.type == SDL_JOYHATMOTION) {
                keys_held[SDL_SCANCODE_LEFT]  = (ev.jhat.value & SDL_HAT_LEFT)  ? 1 : 0;
                keys_held[SDL_SCANCODE_RIGHT] = (ev.jhat.value & SDL_HAT_RIGHT) ? 1 : 0;
                keys_held[SDL_SCANCODE_UP]    = (ev.jhat.value & SDL_HAT_UP)    ? 1 : 0;
                keys_held[SDL_SCANCODE_DOWN]  = (ev.jhat.value & SDL_HAT_DOWN)  ? 1 : 0;
            }
        }
        update_game();
        render_frame();
        Uint32 now = SDL_GetTicks();
        int elapsed = (int)(now - last);
        if (elapsed < 16) SDL_Delay(16 - elapsed);
        last = SDL_GetTicks();
    }

    SDL_CloseAudio();
    SDL_Quit();
    return 0;
}
