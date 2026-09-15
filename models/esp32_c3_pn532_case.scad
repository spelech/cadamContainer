// ============================================================
//  ESP32-C3 SuperMini + PN532 NFC Reader — 3D Printable Case
//  Features:
//   - Snap/clip retention & pad support for ESP32-C3 SuperMini with USB-C cutout
//   - Standoff bosses for PN532 NFC board with M3 screw / heat-set insert options
//   - Top lid with NFC antenna window (open or grill) & debossed label
//   - Alignment lip and corner screw fastening
// ============================================================

$fn = 48;

/* [PN532 NFC Board] */
// PCB length along Y (mm)
pn532_board_length = 43.0;   // [35:0.5:60]
// PCB width along X (mm)
pn532_board_width = 40.0;    // [30:0.5:55]
// Mounting hole center inset from board edges (mm)
pn532_hole_inset = 3.0;      // [2:0.25:6]
// Mount hole diameter on PCB (mm)
pn532_hole_dia = 3.2;        // [2:0.1:4]
// Clearance height under PN532 for header pins & components (mm)
pn532_clearance = 6.5;       // [4:0.5:12]

/* [ESP32-C3 SuperMini] */
// Board length from USB-C edge to antenna edge (mm)
esp32_board_length = 22.5;   // [18:0.5:30]
// Board width across pin rows (mm)
esp32_board_width = 18.0;    // [14:0.5:25]
// PCB thickness (mm)
esp32_pcb_thickness = 1.6;   // [1.0:0.1:2.0]
// Elevation off the case floor for clearance/soldering (mm)
esp32_lift = 1.5;            // [0.5:0.1:4]
// Wall through which the USB-C port exits
esp32_usb_wall = "left";     // [left, right, front, back]

/* [Case Shell] */
wall_thickness = 2.4;        // [1.6:0.1:4]
floor_thickness = 2.4;       // [1.6:0.1:4]
lid_thickness = 2.0;         // [1.5:0.1:4]
// Air gap margin around boards inside case (mm)
side_margin = 4.5;           // [2:0.5:8]
// Interior height (mm)
interior_height = 20.0;      // [16:1:35]

/* [Fastening Style] */
// M3 Fastening method: heat-set threaded inserts vs direct into plastic
fastener_style = "heatset";  // [heatset, selftap]
// Hole diameter for M3 heat-set inserts (mm)
insert_hole_dia = 4.2;       // [3.8:0.1:4.6]
// Pilot hole diameter for direct self-tapping M3 screws (mm)
selftap_pilot_dia = 2.5;     // [2.2:0.1:3.0]

/* [NFC Lid Window] */
// Margin around PN532 board inside window (mm)
window_margin = 7.0;         // [3:0.5:12]
window_style = "open";       // [open, grill]
grill_bar_width = 1.5;       // [0.8:0.1:3]
grill_spacing = 6.0;         // [4:0.5:12]

/* [Preview & Display] */
show_boards = true;
// Lid lift distance for exploded view / inspection (mm)
lid_lift = 30.0;             // [0:1:60]
lid_label = "NFC";
base_color = "#374151";      // Charcoal
lid_color = "#4B5563";       // Gray
esp32_color = "#059669";     // Green PCB
pn532_color = "#DC2626";     // Red PCB

// ============================================================
// Derived Dimensions
// ============================================================
interior_side_x = max(pn532_board_width, esp32_board_length + 20) + 2 * side_margin;
interior_side_y = pn532_board_length + 2 * side_margin;
outer_side_x = interior_side_x + 2 * wall_thickness;
outer_side_y = interior_side_y + 2 * wall_thickness;

half_ix = interior_side_x / 2;
half_iy = interior_side_y / 2;
half_ox = outer_side_x / 2;
half_oy = outer_side_y / 2;

floor_top = floor_thickness;
lid_inner = floor_thickness + interior_height;
lid_top = lid_inner + lid_thickness;

corner_boss_r = 4.0;
corner_boss_cx = half_ix - 1.5;
corner_boss_cy = half_iy - 1.5;

thread_hole_dia = (fastener_style == "heatset") ? insert_hole_dia : selftap_pilot_dia;
thread_depth = (fastener_style == "heatset") ? 6.0 : 10.0;

pn532_boss_r = thread_hole_dia / 2 + 1.5;
pn532_boss_h = 4.0;
pn532_hole_dx = (pn532_board_width / 2) - pn532_hole_inset;
pn532_hole_dy = (pn532_board_length / 2) - pn532_hole_inset;

usb_slot_w = 10.0;
usb_slot_h = 5.6;

// Position ESP32-C3 SuperMini inside the base
esp32_cx = -half_ix + 2.0 + (esp32_board_length / 2);
esp32_cy = 0;

win_w = max(10, pn532_board_width - 2 * window_margin);
win_l = max(10, pn532_board_length - 2 * window_margin);

// ============================================================
// Helper Shapes
// ============================================================
module rounded_box(w, l, h, r) {
    hull() {
        for (sx = [-1, 1], sy = [-1, 1]) {
            translate([sx * (w/2 - r), sy * (l/2 - r), 0])
                cylinder(r=r, h=h);
        }
    }
}

module rounded_slot(w, h, depth, r) {
    hull() {
        for (sy = [-1, 1], sz = [-1, 1]) {
            translate([0, sy * (w/2 - r), sz * (h/2 - r)])
                rotate([0, 90, 0])
                    cylinder(h=depth, r=r, center=true);
        }
    }
}

// ============================================================
// ESP32-C3 SuperMini Retainer
// ============================================================
module esp32_mount() {
    bx = esp32_cx;
    by = esp32_cy;
    pad_h = esp32_lift;
    retainer_h = esp32_lift + esp32_pcb_thickness;

    // 4 corner support pads
    for (dx = [-1, 1], dy = [-1, 1]) {
        translate([bx + dx * (esp32_board_length/2 - 2.5) - 1.5,
                   by + dy * (esp32_board_width/2 - 2.0) - 1.5,
                   floor_top])
            cube([3.0, 3.0, pad_h]);
    }

    // Side alignment rails / snap clips along long edges
    for (sy = [-1, 1]) {
        translate([bx - esp32_board_length/4,
                   by + sy * (esp32_board_width/2 + 0.15) + (sy < 0 ? -1.8 : 0),
                   floor_top]) {
            // Vertical wall
            cube([esp32_board_length / 2, 1.8, retainer_h + 1.2]);
            // Snap lip overhanging the PCB top by 0.6mm
            translate([0, sy > 0 ? -0.5 : 1.8, retainer_h])
                rotate([sy > 0 ? -45 : 45, 0, 0])
                    cube([esp32_board_length / 2, 0.8, 0.8]);
        }
    }

    // End-stop backing at antenna edge (+X)
    translate([bx + esp32_board_length/2 + 0.15, by - esp32_board_width/4, floor_top])
        cube([1.8, esp32_board_width / 2, retainer_h + 1.2]);
}

// ============================================================
// Base Shell
// ============================================================
module base() {
    color(base_color)
    difference() {
        union() {
            // Outer casing
            difference() {
                translate([0, 0, 0])
                    rounded_box(outer_side_x, outer_side_y, lid_inner, 2.5);
                translate([0, 0, floor_top])
                    rounded_box(interior_side_x, interior_side_y, interior_height + 1, 1.5);
            }

            // 4 Corner screw boss pillars
            for (sx = [-1, 1], sy = [-1, 1]) {
                translate([sx * corner_boss_cx, sy * corner_boss_cy, floor_top])
                    cylinder(r=corner_boss_r, h=interior_height);
            }

            // ESP32 Retention Mounts
            esp32_mount();
        }

        // Corner M3 screw holes (heat-set insert or tap)
        for (sx = [-1, 1], sy = [-1, 1]) {
            translate([sx * corner_boss_cx, sy * corner_boss_cy, lid_inner - thread_depth])
                cylinder(r=thread_hole_dia / 2, h=thread_depth + 1);
        }

        // USB-C Connector Cutout through Left Wall (-X)
        translate([-half_ox, esp32_cy, floor_top + esp32_lift + esp32_pcb_thickness / 2 + 0.5])
            rounded_slot(usb_slot_w, usb_slot_h, wall_thickness * 3, 1.8);
    }
}

// ============================================================
// Lid with PN532 Standoffs & Antenna Window
// ============================================================
module lid() {
    color(lid_color)
    translate([0, 0, lid_lift])
    difference() {
        union() {
            // Main Top Plate
            translate([0, 0, lid_inner])
                rounded_box(outer_side_x, outer_side_y, lid_thickness, 2.5);

            // Alignment Lip inserting down into base interior
            lip_depth = 2.5;
            difference() {
                translate([0, 0, lid_inner - lip_depth])
                    rounded_box(interior_side_x - 0.6, interior_side_y - 0.6, lip_depth, 1.2);
                translate([0, 0, lid_inner - lip_depth - 0.1])
                    rounded_box(interior_side_x - 4.0, interior_side_y - 4.0, lip_depth + 0.2, 1.0);
                // Corner relief for base corner bosses
                for (sx = [-1, 1], sy = [-1, 1]) {
                    translate([sx * corner_boss_cx, sy * corner_boss_cy, lid_inner - lip_depth - 0.1])
                        cylinder(r=corner_boss_r + 0.8, h=lip_depth + 0.2);
                }
            }

            // PN532 Mounting Bosses hanging down from lid underside
            for (sx = [-1, 1], sy = [-1, 1]) {
                translate([sx * pn532_hole_dx, sy * pn532_hole_dy, lid_inner - pn532_boss_h])
                    cylinder(r=pn532_boss_r, h=pn532_boss_h);
            }
        }

        // 4 Corner Screw Holes (M3 clearance through lid)
        for (sx = [-1, 1], sy = [-1, 1]) {
            translate([sx * corner_boss_cx, sy * corner_boss_cy, lid_inner - 1])
                cylinder(r=1.7, h=lid_thickness + 2);
            // M3 screw head countersink
            translate([sx * corner_boss_cx, sy * corner_boss_cy, lid_top - 1.2])
                cylinder(r=3.2, h=2.0);
        }

        // PN532 M3 Standoff Pilot/Insert Holes
        for (sx = [-1, 1], sy = [-1, 1]) {
            translate([sx * pn532_hole_dx, sy * pn532_hole_dy, lid_inner - pn532_boss_h - 0.1])
                cylinder(r=thread_hole_dia / 2, h=pn532_boss_h + 0.2);
        }

        // NFC Antenna Center Window Cutout
        if (window_style == "open") {
            translate([0, 0, lid_inner - 1])
                rounded_box(win_w, win_l, lid_thickness + 2, 2.5);
        }

        // Debossed NFC Label
        if (lid_label != "") {
            translate([0, half_iy - 3.5, lid_top - 0.6])
                linear_extrude(1.0)
                    text(lid_label, size=4.5, halign="center", valign="center", font="Liberation Sans:style=Bold");
        }
    }
}

// ============================================================
// Visual Previews of Boards
// ============================================================
module preview_esp32() {
    color(esp32_color)
    translate([esp32_cx - esp32_board_length/2, esp32_cy - esp32_board_width/2, floor_top + esp32_lift]) {
        cube([esp32_board_length, esp32_board_width, esp32_pcb_thickness]);
        // USB-C Port
        color("Silver")
            translate([-1.5, esp32_board_width/2 - 4.5, esp32_pcb_thickness])
                cube([7.5, 9.0, 3.2]);
        // ESP32 Chip
        color("#111827")
            translate([8, esp32_board_width/2 - 3.5, esp32_pcb_thickness])
                cube([7.0, 7.0, 1.0]);
    }
}

module preview_pn532() {
    color(pn532_color)
    translate([0, 0, lid_lift])
    translate([-pn532_board_width/2, -pn532_board_length/2, lid_inner - pn532_boss_h - 1.6]) {
        // PCB Body
        cube([pn532_board_width, pn532_board_length, 1.6]);

        // Gold Antenna Trace
        color("Gold")
        translate([pn532_board_width/2, pn532_board_length/2, 1.61])
            difference() {
                rounded_box(pn532_board_width - 6, pn532_board_length - 6, 0.2, 3);
                rounded_box(pn532_board_width - 10, pn532_board_length - 10, 0.3, 2);
            }

        // Header pins preview (GND, VCC, SDA, SCL)
        color("Black")
            translate([2, 4, -pn532_clearance])
                cube([2.5, 10.0, pn532_clearance]);
    }
}

// ============================================================
// Scene Render
// ============================================================
base();
lid();

if (show_boards) {
    preview_esp32();
    preview_pn532();
}
