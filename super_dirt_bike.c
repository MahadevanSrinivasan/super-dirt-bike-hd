/*
 * EXCITEBIKE (Classic 1984 NES 8-Bit Pixel-Art Edition for RetroPie / SDL2)
 * Renders authentic 320x240 8-bit NES pixel art hardware-scaled via nearest-neighbor
 * to full 1280x720 HDMI at 60 FPS on Raspberry Pi.
 *
 * Features:
 *  - 1. SELECTION A (Solo Time Trial across 5 Tracks)
 *  - 2. SELECTION B (Race against 3 CPU Motocross Rivals with rear-wheel clipping!)
 *  - 3. DESIGN      (Build custom tracks using Obstacles A-I)
 *  - Authentic NES Palette, Trapezoidal Ramps with Red/White & Blue/Yellow Striped Skirts,
 *    Mud Pits, Cooling Arrows (>>), Starting Gate Traffic Light Countdown,
 *    Bottom TEMP Bar with OVER HEAT stall, and Rider Running Back from Grass Shoulder!
 */

#include <SDL2/SDL.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define W 320
#define H 240
#define MAX_OBSTACLES 40
#define MAX_RIVALS 3

typedef struct {
    Uint8 r, g, b;
} Color;

static Color rgb(int r, int g, int b) {
    Color c = {(Uint8)r, (Uint8)g, (Uint8)b};
    return c;
}

/* Authentic 1984 NES Palette */
static const Color C_SKY       = {60, 188, 252};
static const Color C_BLEACHER  = {0, 88, 248};
static const Color C_TURF      = {0, 168, 0};
static const Color C_DIRT      = {248, 184, 120};
static const Color C_DIRT_DARK = {228, 144, 80};
static const Color C_LANE_LINE = {172, 80, 0};
static const Color C_MUD       = {80, 48, 0};
static const Color C_RED       = {216, 40, 0};
static const Color C_WHITE     = {252, 252, 252};
static const Color C_BLACK     = {0, 0, 0};
static const Color C_YELLOW    = {248, 184, 0};
static const Color C_BLUE      = {0, 120, 248};
static const Color C_CYAN      = {60, 188, 252};
static const Color C_GRAY      = {124, 124, 124};
static const Color C_SKIN      = {252, 160, 68};

typedef struct {
    char code;
    const char *name;
    int w1, w2, w3, h;
    int lane_mask; /* bitmask for lanes 0..3 */
    int stripe;    /* 0=red/white, 1=blue/yellow */
    int mud_mask;
    int cool_mask;
} ObsDef;

static const ObsDef OBS_TABLE[11] = {
    {'.', "FLAT",       0,  90, 0,  0,  0xF, 0, 0x0, 0x0},
    {'A', "SMALL BUMP", 18, 4,  18, 16, 0xF, 0, 0x0, 0x0},
    {'B', "TABLETOP",   24, 44, 24, 24, 0xF, 1, 0x0, 0x0},
    {'C', "STEEP JUMP", 26, 6,  26, 36, 0xF, 0, 0x0, 0x0},
    {'D', "PLATEAU",    28, 72, 28, 32, 0xF, 1, 0x0, 0x0},
    {'E', "TOP RAMP",   20, 8,  20, 22, 0x3, 0, 0x0, 0x0},
    {'F', "SUPER JUMP", 42, 10, 42, 58, 0xF, 1, 0x0, 0x0},
    {'G', "MUD PATCH",  0,  90, 0,  0,  0x0, 0, 0x5, 0x0},
    {'H', "COOL ARROW", 0,  80, 0,  0,  0x0, 0, 0x0, 0xA},
    {'I', "BOT RAMP",   20, 8,  20, 22, 0xC, 0, 0x0, 0x0},
    {'!', "FINISH",     28, 36, 28, 26, 0xF, 1, 0x0, 0x0}
};

static const char *TRACK_SEQS[5] = {
    ".AB.G.C.H.D.A.F.H.B.C.",
    ".A.E.I.C.H.G.D.F.H.A.C.F.",
    ".B.G.C.A.A.H.F.D.G.H.C.F.",
    ".C.E.I.G.H.F.A.A.D.H.F.C.",
    ".F.G.C.H.D.E.I.F.G.H.F.F."
};

static char custom_seq[32] = ".ABHCGFDHF.";

typedef struct {
    const ObsDef *def;
    int x, w;
} Obstacle;

typedef struct {
    float x, z, vx, vz;
    float target_speed;
    float lane_y;
    int angle;
    int crashed;
    Color jersey;
    Color bike;
} Rival;

static SDL_Window *window = NULL;
static SDL_Renderer *renderer = NULL;
static SDL_Texture *screen_tex = NULL;
static Uint32 fb[W * H];

static int mode = 0;      /* 0=Selection A, 1=Selection B, 2=Design */
static int track_idx = 0; /* 0..4 */
static int state = 0;     /* 0=title, 1=countdown, 2=racing, 3=finished */
static int tick = 0;
static int cd_timer = 0;
static int cd_stage = 3;

static Obstacle obstacles[MAX_OBSTACLES];
static int num_obstacles = 0;
static int lap_length = 2400;
static float camera_x = 0.0f;

static struct {
    float x, z, vx, vz;
    float lane_y;
    int angle;
    float angle_f;
    int on_ground;
    float temp;
    int overheat_timer;
    int crash_state;
    int crash_timer;
    int lap;
    int total_laps;
    float race_time;
} player;

static Rival rivals[MAX_RIVALS];

/* 8-Bit Square Wave Audio Synthesizer */
static volatile float eng_freq = 0.0f;
static volatile float beep_freq = 0.0f;
static volatile int beep_timer = 0;
static float audio_phase = 0.0f;
static float beep_phase = 0.0f;

static void trigger_beep(float freq, int samples) {
    SDL_LockAudio();
    beep_freq = freq;
    beep_timer = samples;
    SDL_UnlockAudio();
}

static void audio_cb(void *userdata, Uint8 *stream, int len) {
    (void)userdata;
    Sint16 *buf = (Sint16 *)stream;
    int samples = len / 2;
    for (int i = 0; i < samples; i++) {
        int out = 0;
        if (eng_freq > 20.0f) {
            audio_phase += eng_freq / 22050.0f;
            if (audio_phase >= 1.0f) audio_phase -= 1.0f;
            out += (audio_phase < 0.5f) ? 1400 : -1400;
        }
        if (beep_timer > 0 && beep_freq > 20.0f) {
            beep_phase += beep_freq / 22050.0f;
            if (beep_phase >= 1.0f) beep_phase -= 1.0f;
            out += (beep_phase < 0.5f) ? 2400 : -2400;
            beep_timer--;
        }
        buf[i] = (Sint16)out;
    }
}

/* 5x7 Pixel Font */
static const unsigned char font5x7[96][7] = {
    [' ' - 32] = {0,0,0,0,0,0,0},
    ['!' - 32] = {4,4,4,4,4,0,4},
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
    ['>' - 32] = {8,4,2,1,2,4,8},
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

static inline void fill_rect(int x, int y, int w, int h, Color c) {
    int x0 = x < 0 ? 0 : x;
    int y0 = y < 0 ? 0 : y;
    int x1 = (x + w) > W ? W : (x + w);
    int y1 = (y + h) > H ? H : (y + h);
    if (x0 >= x1 || y0 >= y1) return;
    Uint32 pix = 0xFF000000u | ((Uint32)c.r << 16) | ((Uint32)c.g << 8) | (Uint32)c.b;
    for (int ry = y0; ry < y1; ry++) {
        Uint32 *row = &fb[ry * W + x0];
        for (int rx = x0; rx < x1; rx++) {
            *row++ = pix;
        }
    }
}

static inline void stroke_rect(int x, int y, int w, int h, Color c) {
    fill_rect(x, y, w, 1, c);
    fill_rect(x, y + h - 1, w, 1, c);
    fill_rect(x, y, 1, h, c);
    fill_rect(x + w - 1, y, 1, h, c);
}

static void draw_text(int x, int y, const char *s, Color col, int scale) {
    int cx = x;
    while (*s) {
        char c = *s++;
        if (c >= 'a' && c <= 'z') c -= 32;
        if (c >= 32 && c < 128) {
            const unsigned char *g = font5x7[c - 32];
            for (int r = 0; r < 7; r++) {
                unsigned char row_bits = g[r];
                if (!row_bits) continue;
                for (int col_i = 0; col_i < 5; col_i++) {
                    if (row_bits & (1 << (4 - col_i))) {
                        fill_rect(cx + col_i * scale, y + r * scale, scale, scale, col);
                    }
                }
            }
        }
        cx += 6 * scale;
    }
}

static const ObsDef *find_obs_def(char code) {
    for (int i = 0; i < 11; i++) {
        if (OBS_TABLE[i].code == code) return &OBS_TABLE[i];
    }
    return &OBS_TABLE[0];
}

static void build_track(void) {
    num_obstacles = 0;
    const char *seq = (mode == 2) ? custom_seq : TRACK_SEQS[track_idx % 5];
    int cur_x = 180;
    for (int i = 0; seq[i] && num_obstacles < MAX_OBSTACLES - 1; i++) {
        const ObsDef *d = find_obs_def(seq[i]);
        int tw = d->w1 + d->w2 + d->w3;
        obstacles[num_obstacles].def = d;
        obstacles[num_obstacles].x = cur_x;
        obstacles[num_obstacles].w = tw;
        num_obstacles++;
        cur_x += tw + 52;
    }
    const ObsDef *fin = find_obs_def('!');
    obstacles[num_obstacles].def = fin;
    obstacles[num_obstacles].x = cur_x;
    obstacles[num_obstacles].w = fin->w1 + fin->w2 + fin->w3;
    num_obstacles++;
    lap_length = cur_x + 140;
}

static void sample_track(float wx, int lane, float *out_h, int *out_slope, int *out_mud, int *out_cool) {
    *out_h = 0.0f;
    *out_slope = 0;
    *out_mud = 0;
    *out_cool = 0;
    float wrapped = fmodf(wx, (float)lap_length);
    if (wrapped < 0) wrapped += lap_length;

    for (int i = 0; i < num_obstacles; i++) {
        Obstacle *ob = &obstacles[i];
        if (wrapped >= ob->x && wrapped <= ob->x + ob->w) {
            const ObsDef *d = ob->def;
            if (d->h > 0 && (d->lane_mask & (1 << lane))) {
                float u = wrapped - ob->x;
                if (u < d->w1) {
                    *out_h = (u / d->w1) * d->h;
                    *out_slope = -1;
                } else if (u <= d->w1 + d->w2) {
                    *out_h = (float)d->h;
                    *out_slope = 0;
                } else {
                    *out_h = (1.0f - (u - d->w1 - d->w2) / (float)d->w3) * d->h;
                    *out_slope = 1;
                }
                return;
            }
            if (d->mud_mask & (1 << lane)) *out_mud = 1;
            if (d->cool_mask & (1 << lane)) *out_cool = 1;
            return;
        }
    }
}

static void start_race(void) {
    build_track();
    memset(&player, 0, sizeof(player));
    player.x = 44.0f;
    player.lane_y = 1.0f;
    player.on_ground = 1;
    player.temp = 20.0f;
    player.lap = 1;
    player.total_laps = 2;
    camera_x = 0.0f;

    Color jc[3] = {C_BLUE, C_YELLOW, C_TURF};
    Color bc[3] = {C_CYAN, C_WHITE, C_YELLOW};
    int lanes[3] = {0, 2, 3};
    for (int i = 0; i < MAX_RIVALS; i++) {
        memset(&rivals[i], 0, sizeof(Rival));
        rivals[i].x = 44.0f;
        rivals[i].target_speed = 2.35f + i * 0.18f;
        rivals[i].lane_y = (float)lanes[i];
        rivals[i].jersey = jc[i];
        rivals[i].bike = bc[i];
    }

    state = 1; /* countdown */
    cd_timer = 180;
    cd_stage = 3;
    trigger_beep(440.0f, 3500);
}

static void trigger_crash(void) {
    player.crash_state = 1;
    player.crash_timer = 85;
    player.angle = 0;
    player.angle_f = 0;
    trigger_beep(120.0f, 6500);
}

static Uint8 keys_held[SDL_NUM_SCANCODES];
static Uint8 prev_held[SDL_NUM_SCANCODES];

static void update_game(void) {
    tick++;
    int k_gas   = keys_held[SDL_SCANCODE_SPACE] || keys_held[SDL_SCANCODE_X] || keys_held[SDL_SCANCODE_K];
    int p_gas   = prev_held[SDL_SCANCODE_SPACE] || prev_held[SDL_SCANCODE_X] || prev_held[SDL_SCANCODE_K];
    int k_turbo = keys_held[SDL_SCANCODE_Z] || keys_held[SDL_SCANCODE_LSHIFT] || keys_held[SDL_SCANCODE_RSHIFT];
    int p_turbo = prev_held[SDL_SCANCODE_Z] || prev_held[SDL_SCANCODE_LSHIFT] || prev_held[SDL_SCANCODE_RSHIFT];
    int k_left  = keys_held[SDL_SCANCODE_LEFT] || keys_held[SDL_SCANCODE_A];
    int k_right = keys_held[SDL_SCANCODE_RIGHT] || keys_held[SDL_SCANCODE_D];
    int k_up    = keys_held[SDL_SCANCODE_UP] || keys_held[SDL_SCANCODE_W];
    int p_up    = prev_held[SDL_SCANCODE_UP] || prev_held[SDL_SCANCODE_W];
    int k_down  = keys_held[SDL_SCANCODE_DOWN] || keys_held[SDL_SCANCODE_S];
    int p_down  = prev_held[SDL_SCANCODE_DOWN] || prev_held[SDL_SCANCODE_S];

    if (state == 0 || state == 3) {
        eng_freq = 0.0f;
        if (k_up && !p_up) { mode = (mode + 2) % 3; trigger_beep(660.0f, 1500); }
        if (k_down && !p_down) { mode = (mode + 1) % 3; trigger_beep(660.0f, 1500); }
        if (k_left && !prev_held[SDL_SCANCODE_LEFT]) { track_idx = (track_idx + 4) % 5; trigger_beep(520.0f, 1500); }
        if (k_right && !prev_held[SDL_SCANCODE_RIGHT]) { track_idx = (track_idx + 1) % 5; trigger_beep(520.0f, 1500); }
        if ((keys_held[SDL_SCANCODE_RETURN] && !prev_held[SDL_SCANCODE_RETURN]) || (k_gas && !p_gas)) {
            start_race();
        }
        return;
    }

    if (state == 1) {
        eng_freq = (k_gas || k_turbo) ? 95.0f : 52.0f;
        cd_timer--;
        if (cd_timer == 120 || cd_timer == 60) {
            cd_stage--;
            trigger_beep(440.0f, 3500);
        } else if (cd_timer <= 0) {
            state = 2;
            trigger_beep(880.0f, 7000);
        }
        return;
    }

    player.race_time += 1.0f / 60.0f;

    if (player.crash_state > 0) {
        eng_freq = 0.0f;
        if ((k_gas && !p_gas) || (k_turbo && !p_turbo)) player.crash_timer -= 5;
        player.crash_timer--;
        if (player.crash_timer < 45) player.crash_state = 2;
        if (player.crash_timer <= 0) {
            player.crash_state = 0;
            player.vx = 0.8f;
            player.z = 0;
            player.vz = 0;
            player.angle = 0;
            player.angle_f = 0;
        }
        return;
    }

    if (player.overheat_timer > 0) {
        player.vx *= 0.92f;
        player.overheat_timer--;
        player.temp -= 0.55f;
        if (player.temp < 25.0f) player.temp = 25.0f;
        eng_freq = (tick & 8) ? 320.0f : 220.0f;
        player.x += player.vx;
        camera_x = player.x - 64.0f;
        return;
    }

    int cur_lane = (int)(player.lane_y + 0.5f);
    float trk_h;
    int trk_slope, in_mud, in_cool;
    sample_track(player.x, cur_lane, &trk_h, &trk_slope, &in_mud, &in_cool);

    if (player.on_ground && in_cool) {
        if (player.temp > 20.0f) trigger_beep(980.0f, 2000);
        player.temp = 16.0f;
    }

    int act_turbo = k_turbo;
    int act_gas = k_gas || k_turbo;
    if (act_turbo) {
        player.temp += 0.28f;
        if (player.temp >= 100.0f) {
            player.temp = 100.0f;
            player.overheat_timer = 180;
            trigger_beep(260.0f, 8000);
            return;
        }
    } else if (act_gas) {
        if (player.temp < 52.0f) player.temp += 0.06f;
        else player.temp -= 0.12f;
    } else {
        player.temp -= 0.24f;
        if (player.temp < 18.0f) player.temp = 18.0f;
    }

    if (player.on_ground) {
        if (k_up && player.lane_y > 0.0f) {
            player.lane_y -= 0.065f;
            if (player.lane_y < 0.0f) player.lane_y = 0.0f;
        } else if (k_down && player.lane_y < 3.0f) {
            player.lane_y += 0.065f;
            if (player.lane_y > 3.0f) player.lane_y = 3.0f;
        } else {
            float near_l = (float)((int)(player.lane_y + 0.5f));
            player.lane_y += (near_l - player.lane_y) * 0.2f;
        }
    }

    float top_s = act_turbo ? 3.55f : (act_gas ? 2.65f : 0.0f);
    if (player.on_ground && in_mud && player.angle >= 0) {
        if (top_s > 1.15f) top_s = 1.15f;
    }
    if (player.on_ground && trk_slope == -1) top_s *= 0.85f;
    else if (player.on_ground && trk_slope == 1) top_s *= 1.12f;

    if (act_gas) {
        if (player.vx < top_s) {
            player.vx += act_turbo ? 0.065f : 0.045f;
            if (player.vx > top_s) player.vx = top_s;
        } else {
            player.vx -= 0.04f;
        }
    } else {
        player.vx -= 0.03f;
        if (player.vx < 0.0f) player.vx = 0.0f;
    }

    int prev_slope = trk_slope;
    player.x += player.vx;
    float next_h;
    int next_slope, nm, nc;
    sample_track(player.x, (int)(player.lane_y + 0.5f), &next_h, &next_slope, &nm, &nc);

    if (player.on_ground) {
        if (prev_slope == -1 && next_slope >= 0 && player.vx > 1.3f) {
            player.on_ground = 0;
            player.vz = player.vx * 0.95f;
            player.z = next_h + player.vz;
            player.angle_f = -1.0f;
            player.angle = -1;
            trigger_beep(320.0f, 1800);
        } else if (next_h < player.z - 2.0f && player.vx > 1.5f) {
            player.on_ground = 0;
            player.vz = 0.2f;
        } else {
            player.z = next_h;
            player.vz = 0.0f;
            if (k_left) {
                player.angle_f -= 0.085f;
                if (player.angle_f < -2.75f) {
                    trigger_crash();
                    return;
                }
            } else if (k_right) {
                player.angle_f += 0.12f;
                if (player.angle_f > 0.0f) player.angle_f = 0.0f;
            } else {
                player.angle_f += (next_slope - player.angle_f) * 0.22f;
            }
            int a = (int)roundf(player.angle_f);
            if (a < -2) a = -2;
            if (a > 2) a = 2;
            player.angle = a;
        }
    } else {
        player.z += player.vz;
        player.vz -= 0.12f;
        if (k_left) {
            player.angle_f -= 0.075f;
            if (player.angle_f < -2.3f) player.angle_f = -2.3f;
        } else if (k_right) {
            player.angle_f += 0.075f;
            if (player.angle_f > 2.3f) player.angle_f = 2.3f;
        }
        int a = (int)roundf(player.angle_f);
        if (a < -2) a = -2;
        if (a > 2) a = 2;
        player.angle = a;

        if (player.z <= next_h) {
            player.z = next_h;
            player.on_ground = 1;
            player.vz = 0.0f;
            int ideal = (next_slope == 1) ? 1 : (next_slope == -1 ? -1 : 0);
            int diff = abs(player.angle - ideal);
            if (diff == 0) {
                player.vx += 0.25f;
                if (player.vx > 3.8f) player.vx = 3.8f;
            } else if (diff == 1) {
                player.vx *= 0.78f;
            } else {
                trigger_crash();
                return;
            }
            player.angle_f = (float)next_slope;
            player.angle = next_slope;
        }
    }

    int cur_lap = (int)(player.x / lap_length) + 1;
    if (cur_lap > player.lap) {
        player.lap = cur_lap;
        if (player.lap > player.total_laps) {
            state = 3;
            trigger_beep(1046.0f, 9000);
            return;
        } else {
            trigger_beep(784.0f, 4000);
        }
    }

    if (mode == 1) {
        for (int i = 0; i < MAX_RIVALS; i++) {
            Rival *rv = &rivals[i];
            if (rv->crashed > 0) { rv->crashed--; continue; }
            rv->vx += (rv->target_speed - rv->vx) * 0.05f;
            float rh1, rh2;
            int rs1, rs2, rm, rc;
            sample_track(rv->x, (int)(rv->lane_y + 0.5f), &rh1, &rs1, &rm, &rc);
            rv->x += rv->vx;
            sample_track(rv->x, (int)(rv->lane_y + 0.5f), &rh2, &rs2, &rm, &rc);
            if (rv->z <= rh2) {
                if (rs1 == -1 && rs2 >= 0 && rv->vx > 1.5f) {
                    rv->vz = rv->vx * 0.85f;
                    rv->z = rh2 + rv->vz;
                    rv->angle = -1;
                } else {
                    rv->z = rh2;
                    rv->vz = 0;
                    rv->angle = rs2;
                }
            } else {
                rv->z += rv->vz;
                rv->vz -= 0.12f;
                rv->angle = (rv->vz > 0) ? -1 : 1;
            }
            float dx = player.x - rv->x;
            if (fabsf(player.lane_y - rv->lane_y) < 0.55f && fabsf(player.z - rv->z) < 12.0f && fabsf(dx) < 16.0f) {
                if (dx >= 0.0f) {
                    rv->crashed = 65;
                    rv->vx = 0;
                    trigger_beep(520.0f, 2500);
                } else {
                    trigger_crash();
                }
            }
        }
    }

    camera_x = player.x - 64.0f;
    eng_freq = 52.0f + player.vx * 36.0f + (act_turbo ? 28.0f : 0.0f) + (player.on_ground ? 0.0f : 35.0f);
}

static void draw_pixel_bike(int sx, int sy, int angle, Color jersey, Color bike_c, int w_phase, int crashing) {
    int dy_f = 0, dy_r = 0;
    if (!crashing) {
        if (angle == -2) { dy_f = -7; dy_r = 1; }
        else if (angle == -1) { dy_f = -4; dy_r = 0; }
        else if (angle == 1) { dy_f = 3; dy_r = -2; }
        else if (angle == 2) { dy_f = 6; dy_r = -4; }
    } else {
        dy_f = (tick & 4) ? -5 : 5;
        dy_r = -dy_f;
    }

    /* Rear & Front 8-bit Wheels */
    int wx[2] = {sx - 8, sx + 8};
    int wy[2] = {sy - 4 + dy_r, sy - 4 + dy_f};
    for (int w = 0; w < 2; w++) {
        fill_rect(wx[w] - 4, wy[w] - 4, 8, 8, C_BLACK);
        fill_rect(wx[w] - 2, wy[w] - 2, 4, 4, C_WHITE);
        if (w_phase & 1) fill_rect(wx[w] - 3, wy[w], 6, 1, C_GRAY);
        else fill_rect(wx[w], wy[w] - 3, 1, 6, C_GRAY);
    }

    int mid_y = sy + (dy_f + dy_r) / 2;
    fill_rect(sx - 6, mid_y - 8, 10, 4, C_GRAY);
    fill_rect(sx - 10, mid_y - 10, 18, 3, bike_c);
    fill_rect(sx + 4, sy - 13 + dy_f, 5, 6, bike_c);

    if (!crashing) {
        int off_x = -angle * 2;
        fill_rect(sx - 5 + off_x, mid_y - 12, 4, 4, C_WHITE);
        fill_rect(sx - 6 + off_x, mid_y - 18, 6, 6, jersey);
        fill_rect(sx + off_x, mid_y - 16, 5, 2, C_SKIN);
        fill_rect(sx - 4 + off_x, mid_y - 24, 7, 6, C_WHITE);
        fill_rect(sx - 4 + off_x, mid_y - 21, 7, 2, jersey);
        fill_rect(sx + 1 + off_x, mid_y - 23, 2, 2, C_BLACK);
    }
}

static void render_frame(void) {
    /* 1. Stadium Grandstands & Infield (Y = 0..88) */
    fill_rect(0, 0, W, 32, C_BLEACHER);
    int crowd_off = ((int)(camera_x * 0.25f)) % 16;
    if (crowd_off < 0) crowd_off += 16;
    for (int y = 4; y < 28; y += 6) {
        for (int x = -crowd_off; x < W; x += 8) {
            fill_rect(x, y, 3, 3, ((x + y) & 8) ? C_WHITE : C_RED);
            fill_rect(x + 4, y + 2, 3, 3, C_YELLOW);
        }
    }
    fill_rect(0, 32, W, 6, C_WHITE);
    fill_rect(0, 34, W, 2, C_RED);
    fill_rect(0, 38, W, 50, C_TURF);

    int prop_off = ((int)camera_x) % 320;
    if (prop_off < 0) prop_off += 320;
    for (int k = -1; k <= 1; k++) {
        int px = k * 320 - prop_off;
        fill_rect(px + 60, 64, 24, 10, C_WHITE);
        fill_rect(px + 64, 64, 6, 4, C_RED);
        fill_rect(px + 76, 64, 6, 4, C_RED);
        fill_rect(px + 170, 52, 22, 20, C_BLUE);
        stroke_rect(px + 170, 52, 22, 20, C_WHITE);
        char tnum[8];
        snprintf(tnum, sizeof(tnum), "%d", track_idx + 1);
        draw_text(px + 178, 58, tnum, C_WHITE, 1);
        fill_rect(px + 250, 56, 44, 18, C_WHITE);
        fill_rect(px + 264, 48, 16, 8, C_RED);
        draw_text(px + 254, 62, "0:58:0", C_BLACK, 1);
    }

    /* 2. Top & Bottom Red/White Curbs + 4-Lane Tan Dirt Track (Y = 88..184) */
    int curb_off = ((int)camera_x) % 16;
    if (curb_off < 0) curb_off += 16;
    for (int x = -curb_off; x < W; x += 16) {
        fill_rect(x, 88, 8, 6, C_RED);
        fill_rect(x + 8, 88, 8, 6, C_WHITE);
        fill_rect(x, 166, 8, 5, C_WHITE);
        fill_rect(x + 8, 166, 8, 5, C_RED);
    }
    fill_rect(0, 94, W, 72, C_DIRT);
    fill_rect(0, 171, W, 13, C_TURF);

    int dash_off = ((int)camera_x) % 12;
    if (dash_off < 0) dash_off += 12;
    for (int l = 1; l <= 3; l++) {
        for (int x = -dash_off; x < W; x += 12) {
            fill_rect(x, 94 + l * 18, 6, 1, C_LANE_LINE);
        }
    }

    /* Starting Gate Stalls */
    int st_sx = (int)(44.0f - camera_x);
    if (st_sx > -30 && st_sx < W) {
        for (int l = 0; l < 4; l++) {
            int ly = 94 + l * 18;
            fill_rect(st_sx + 10, ly + 2, 4, 15, C_WHITE);
            fill_rect(st_sx + 14, ly + 2, 3, 15, (state == 1) ? C_RED : C_TURF);
        }
    }

    /* 3. Render Discrete NES Obstacles (Trapezoidal Ramps, Mud Pits, Cool Arrows) */
    for (int lap = 0; lap <= 2; lap++) {
        int base_x = lap * lap_length;
        for (int i = 0; i < num_obstacles; i++) {
            Obstacle *ob = &obstacles[i];
            int sx = base_x + ob->x - (int)camera_x;
            if (sx + ob->w < -20 || sx > W + 20) continue;
            const ObsDef *d = ob->def;

            if (d->mud_mask) {
                for (int ln = 0; ln < 4; ln++) {
                    if (d->mud_mask & (1 << ln)) {
                        int my = 96 + ln * 18;
                        fill_rect(sx, my, ob->w, 14, C_MUD);
                        fill_rect(sx + 6, my + 4, ob->w - 12, 3, C_DIRT_DARK);
                    }
                }
            }
            if (d->cool_mask) {
                for (int ln = 0; ln < 4; ln++) {
                    if (d->cool_mask & (1 << ln)) {
                        int cy = 97 + ln * 18;
                        fill_rect(sx + 16, cy, 28, 12, C_YELLOW);
                        draw_text(sx + 20, cy + 3, ">>", C_RED, 1);
                    }
                }
            }
            if (d->h > 0 && d->lane_mask) {
                int top_l = (d->lane_mask == 0xC) ? 2 : 0;
                int bot_l = (d->lane_mask == 0x3) ? 1 : 3;
                int y_top = 94 + top_l * 18;
                int y_bot = 94 + (bot_l + 1) * 18;
                int span_h = y_bot - y_top;
                Color surf = (d->code == '!') ? C_WHITE : C_DIRT_DARK;
                Color s1 = d->stripe ? C_BLUE : C_RED;
                Color s2 = d->stripe ? C_YELLOW : C_WHITE;

                for (int rx = 0; rx < ob->w; rx += 2) {
                    int rh = d->h;
                    if (rx < d->w1) rh = (rx * d->h) / d->w1;
                    else if (rx > d->w1 + d->w2) rh = ((ob->w - rx) * d->h) / d->w3;
                    /* Ramp surface column */
                    fill_rect(sx + rx, y_top - rh, 2, span_h, surf);
                    /* Striped side skirt at bottom of ramp */
                    fill_rect(sx + rx, y_bot - rh, 2, rh, ((rx >> 2) & 1) ? s1 : s2);
                }
                if (d->code == '!') {
                    draw_text(sx + d->w1 + 2, y_top - d->h + 6, "FINISH", C_RED, 1);
                }
            }
        }
    }

    /* 4. Rivals & Player Bike */
    if (mode == 1) {
        for (int i = 0; i < MAX_RIVALS; i++) {
            Rival *rv = &rivals[i];
            int rsx = (int)(rv->x - camera_x);
            int rgy = 106 + (int)(rv->lane_y * 18.0f);
            if (rv->z > 2.0f) fill_rect(rsx - 9, rgy - 2, 18, 3, C_BLACK);
            draw_pixel_bike(rsx, rgy - (int)rv->z, rv->angle, rv->jersey, rv->bike, (int)(rv->x * 0.5f), rv->crashed > 0);
        }
    }

    int psx = (int)(player.x - camera_x);
    int pgy = 106 + (int)(player.lane_y * 18.0f);
    if (player.z > 2.0f) fill_rect(psx - 9, pgy - 2, 18, 3, C_BLACK);
    draw_pixel_bike(psx, pgy - (int)player.z, player.angle, C_RED, C_WHITE, (int)(player.x * 0.5f), player.crash_state == 1);

    /* Little Pixel Rider Running Back from Grass Shoulder after Crash */
    if (player.crash_state > 0) {
        int rx = psx - (int)(player.crash_timer * 0.35f);
        int ry = (player.crash_state == 1) ? 176 : pgy;
        int leg = (tick >> 2) & 1;
        fill_rect(rx - 2, ry - 14, 5, 5, C_WHITE);
        fill_rect(rx - 2, ry - 9, 5, 5, C_RED);
        fill_rect(rx - 2 + (leg ? -2 : 1), ry - 4, 2, 4, C_BLUE);
        fill_rect(rx + (leg ? 2 : -1), ry - 4, 2, 4, C_BLUE);
        draw_text(W / 2 - 54, 72, "MASH A/B TO RECOVER!", C_WHITE, 1);
    }

    if (state == 1) {
        fill_rect(136, 44, 48, 22, C_BLACK);
        stroke_rect(136, 44, 48, 22, C_WHITE);
        for (int i = 0; i < 3; i++) {
            fill_rect(142 + i * 14, 50, 8, 10, (3 - cd_stage >= i) ? C_RED : C_GRAY);
        }
    }

    if (player.overheat_timer > 0 && (tick & 8)) {
        fill_rect(118, 118, 84, 20, C_BLACK);
        stroke_rect(118, 118, 84, 20, C_RED);
        draw_text(132, 125, "OVER HEAT", C_WHITE, 1);
    }

    if (mode == 2) {
        fill_rect(0, 0, W, 20, C_BLACK);
        draw_text(8, 6, "DESIGN MODE: PRESS KEYS A-I TO ADD OBSTACLE", C_YELLOW, 1);
    }

    /* 5. Bottom NES Black & Blue Dashboard (Y = 184..240) */
    fill_rect(0, 184, W, 56, C_BLACK);
    fill_rect(10, 192, 96, 40, C_BLEACHER);
    stroke_rect(10, 192, 96, 40, C_WHITE);
    draw_text(38, 198, "TEMP", C_WHITE, 1);
    fill_rect(18, 212, 80, 12, C_BLACK);
    int tw = (int)((player.temp / 100.0f) * 76.0f);
    Color tc = (player.temp > 78.0f && (tick & 4)) ? C_RED : (player.temp > 60.0f ? C_YELLOW : C_WHITE);
    fill_rect(20, 214, tw, 8, tc);

    fill_rect(114, 192, 96, 40, C_BLEACHER);
    stroke_rect(114, 192, 96, 40, C_WHITE);
    int mins = (int)(player.race_time / 60.0f);
    int secs = ((int)player.race_time) % 60;
    int hund = ((int)(player.race_time * 100.0f)) % 100;
    char tbuf[32], lbuf[32];
    snprintf(tbuf, sizeof(tbuf), "TIME %d:%02d:%02d", mins, secs, hund);
    snprintf(lbuf, sizeof(lbuf), "LAP  %d/%d", player.lap <= player.total_laps ? player.lap : player.total_laps, player.total_laps);
    draw_text(122, 198, tbuf, C_WHITE, 1);
    draw_text(122, 214, lbuf, C_YELLOW, 1);

    fill_rect(218, 192, 92, 40, C_BLEACHER);
    stroke_rect(218, 192, 92, 40, C_WHITE);
    draw_text(226, 198, "BEST 0:58:00", C_WHITE, 1);
    draw_text(226, 214, "A:GAS B:TURBO", C_CYAN, 1);

    /* 6. Classic 1984 NES Title / Finish Screen */
    if (state == 0 || state == 3) {
        fill_rect(24, 18, W - 48, 162, C_BLACK);
        stroke_rect(24, 18, W - 48, 162, C_RED);
        fill_rect(52, 28, 216, 30, C_RED);
        draw_text(72, 36, "EXCITEBIKE", C_WHITE, 3);
        draw_text(64, 66, (state == 3) ? tbuf : "1984 NINTENDO 8-BIT EDITION", C_YELLOW, 1);

        const char *opts[3] = {
            "1. SELECTION A (SOLO TIME TRIAL)",
            "2. SELECTION B (RACE VS RIVALS)",
            "3. DESIGN      (BUILD TRACK A-I)"
        };
        for (int i = 0; i < 3; i++) {
            if (mode == i) draw_text(46, 92 + i * 16, ">", C_RED, 1);
            draw_text(58, 92 + i * 16, opts[i], (mode == i) ? C_WHITE : C_GRAY, 1);
        }
        draw_text(44, 146, "SPACE/A = GAS    Z/SHIFT/B = TURBO", C_CYAN, 1);
        draw_text(44, 160, "PRESS ENTER OR SPACE TO START!", C_TURF, 1);
    }

    SDL_UpdateTexture(screen_tex, NULL, fb, W * (int)sizeof(Uint32));
    SDL_RenderCopy(renderer, screen_tex, NULL, NULL);
    SDL_RenderPresent(renderer);
}

int main(int argc, char **argv) {
    (void)argc; (void)argv;
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO | SDL_INIT_JOYSTICK | SDL_INIT_GAMECONTROLLER) < 0) return 1;
    /* Nearest-neighbor crisp pixel scaling ("0") for authentic 8-bit NES look! */
    SDL_SetHint(SDL_HINT_RENDER_SCALE_QUALITY, "0");
    SDL_ShowCursor(SDL_DISABLE);
    if (SDL_NumJoysticks() > 0) SDL_JoystickOpen(0);

    window = SDL_CreateWindow("Excitebike (NES 1984 Edition)", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
                              1280, 720, SDL_WINDOW_FULLSCREEN_DESKTOP | SDL_WINDOW_SHOWN);
    if (!window) window = SDL_CreateWindow("Excitebike", 0, 0, 1280, 720, SDL_WINDOW_FULLSCREEN);
    renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_ACCELERATED);
    if (!renderer) renderer = SDL_CreateRenderer(window, -1, 0);
    screen_tex = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_ARGB8888, SDL_TEXTUREACCESS_STREAMING, W, H);

    SDL_AudioSpec want;
    memset(&want, 0, sizeof(want));
    want.freq = 22050;
    want.format = AUDIO_S16SYS;
    want.channels = 1;
    want.samples = 512;
    want.callback = audio_cb;
    if (SDL_OpenAudio(&want, NULL) >= 0) SDL_PauseAudio(0);

    build_track();

    if (argc > 1 && strcmp(argv[1], "--bench") == 0) {
        mode = 1;
        start_race();
        state = 2;
        keys_held[SDL_SCANCODE_SPACE] = 1;
        Uint32 t0 = SDL_GetTicks();
        for (int f = 0; f < 120; f++) {
            update_game();
            render_frame();
        }
        Uint32 dt = SDL_GetTicks() - t0;
        printf("Excitebike 120 racing frames in %u ms (%.2f ms/frame, %.1f FPS)\n", dt, dt / 120.0, 120000.0 / dt);
        SDL_CloseAudio();
        SDL_Quit();
        return 0;
    }

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
                    if (state == 0) running = 0;
                    else state = 0;
                }
                if (mode == 2 && sc >= SDL_SCANCODE_A && sc <= SDL_SCANCODE_I) {
                    size_t l = strlen(custom_seq);
                    if (l < sizeof(custom_seq) - 2) {
                        custom_seq[l - 1] = (char)('A' + (sc - SDL_SCANCODE_A));
                        custom_seq[l] = '.';
                        custom_seq[l + 1] = '\0';
                        build_track();
                        trigger_beep(660.0f, 1500);
                    }
                }
                if (sc < SDL_NUM_SCANCODES) keys_held[sc] = 1;
            } else if (ev.type == SDL_KEYUP) {
                SDL_Scancode sc = ev.key.keysym.scancode;
                if (sc < SDL_NUM_SCANCODES) keys_held[sc] = 0;
            } else if (ev.type == SDL_JOYBUTTONDOWN || ev.type == SDL_JOYBUTTONUP) {
                int down = (ev.type == SDL_JOYBUTTONDOWN) ? 1 : 0;
                if (ev.jbutton.button == 0 || ev.jbutton.button == 1) keys_held[SDL_SCANCODE_SPACE] = down;
                else if (ev.jbutton.button == 2 || ev.jbutton.button == 3) keys_held[SDL_SCANCODE_Z] = down;
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
