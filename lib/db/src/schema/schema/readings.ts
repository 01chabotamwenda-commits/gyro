import { pgTable, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const readingsTable = pgTable("readings", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  tiltX: real("tilt_x").notNull().default(0),
  tiltY: real("tilt_y").notNull().default(0),
  rotationZ: real("rotation_z").notNull().default(0),
  rpm: real("rpm").notNull().default(0),
  temperature: real("temperature").notNull().default(25),
  motorPwm: real("motor_pwm").notNull().default(0),
  vibration: real("vibration").notNull().default(0),
  /** Kalman-filtered tilt angle (pre reference-subtraction), degrees.
   *  Distinct from tiltX/Y, which are the post-reference *error* terms. */
  filteredAngleX: real("filtered_angle_x").notNull().default(0),
  filteredAngleY: real("filtered_angle_y").notNull().default(0),
  /** Actual ESC pulse width sent to the motor, in microseconds (not a %). */
  motorPulseUs: real("motor_pulse_us").notNull().default(0),
});

export const insertReadingSchema = createInsertSchema(readingsTable).omit({
  id: true,
});
export type InsertReading = z.infer<typeof insertReadingSchema>;
export type Reading = typeof readingsTable.$inferSelect;
