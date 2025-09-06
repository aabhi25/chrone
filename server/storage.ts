import {
  teachers,
  subjects,
  classes,
  timetableEntries,
  substitutions,
  timetableValidityPeriods,
  classSubjectAssignments,
  timetableStructures,
  timetableVersions,
  users,
  schools,
  teacherAttendance,
  type Teacher,
  type InsertTeacher,
  type Subject,
  type InsertSubject,
  type Class,
  type InsertClass,
  type TimetableEntry,
  type InsertTimetableEntry,
  type TimetableValidityPeriod,
  type InsertTimetableValidityPeriod,
  type ClassSubjectAssignment,
  type InsertClassSubjectAssignment,
  type TimetableStructure,
  type InsertTimetableStructure,
  type TimetableVersion,
  type InsertTimetableVersion,
  type Substitution,
  type InsertSubstitution,
  type User,
  type InsertUser,
  type School,
  type InsertSchool,
  type TeacherAttendance,
  type InsertTeacherAttendance,
  type BulkAttendanceData,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray, sql, ne, gte, lte, between } from "drizzle-orm";
import { getCurrentDateIST, getCurrentDateTimeIST } from "@shared/utils/dateUtils";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersBySchoolId(schoolId: string): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User>;

  // School operations
  getSchools(): Promise<School[]>;
  getSchoolsWithAdminEmails(): Promise<(School & { adminEmail?: string })[]>;
  getSchool(id: string): Promise<School | undefined>;
  createSchool(school: InsertSchool): Promise<School>;
  updateSchool(id: string, school: Partial<InsertSchool>): Promise<School>;
  deleteSchool(id: string): Promise<void>;

  // Teacher operations
  getTeachers(schoolId?: string): Promise<Teacher[]>;
  getTeacher(id: string): Promise<Teacher | undefined>;
  getTeacherCountBySchool(schoolId: string): Promise<number>;
  createTeacher(teacher: InsertTeacher): Promise<Teacher>;
  updateTeacher(id: string, teacher: Partial<InsertTeacher>): Promise<Teacher>;
  deleteTeacher(id: string): Promise<void>;
  getAvailableTeachers(day: string, period: number, subjectId: string, schoolId: string): Promise<Teacher[]>;

  // Subject operations
  getSubjects(schoolId?: string): Promise<Subject[]>;
  getSubject(id: string): Promise<Subject | undefined>;
  createSubject(subject: InsertSubject): Promise<Subject>;
  updateSubject(id: string, subject: Partial<InsertSubject>): Promise<Subject>;
  deleteSubject(id: string): Promise<void>;
  checkSubjectCodeExists(code: string, schoolId: string, excludeId?: string): Promise<boolean>;

  // Class operations
  getClasses(schoolId?: string): Promise<Class[]>;
  getClass(id: string): Promise<Class | undefined>;
  createClass(classData: InsertClass): Promise<Class>;
  updateClass(id: string, classData: Partial<InsertClass>): Promise<Class>;
  deleteClass(id: string): Promise<void>;
  checkClassExists(grade: string, section: string | null, schoolId: string, excludeId?: string): Promise<boolean>;

  // Class Subject Assignment operations
  getClassSubjectAssignments(classId?: string): Promise<any[]>;
  getClassSubjectAssignment(id: string): Promise<ClassSubjectAssignment | undefined>;
  createClassSubjectAssignment(assignment: InsertClassSubjectAssignment): Promise<ClassSubjectAssignment>;
  updateClassSubjectAssignment(id: string, assignment: Partial<InsertClassSubjectAssignment>): Promise<ClassSubjectAssignment>;
  deleteClassSubjectAssignment(id: string): Promise<void>;
  getClassSubjectAssignmentByClassAndSubject(classId: string, subjectId: string): Promise<ClassSubjectAssignment | undefined>;

  // Timetable operations
  getTimetableEntries(): Promise<TimetableEntry[]>;
  getTimetableForClass(classId: string): Promise<TimetableEntry[]>;
  getTimetableForTeacher(teacherId: string): Promise<TimetableEntry[]>;
  createTimetableEntry(entry: InsertTimetableEntry): Promise<TimetableEntry>;
  updateTimetableEntry(id: string, entry: Partial<InsertTimetableEntry>): Promise<TimetableEntry>;
  deleteTimetableEntry(id: string): Promise<void>;
  clearTimetable(): Promise<void>;
  bulkCreateTimetableEntries(entries: InsertTimetableEntry[]): Promise<TimetableEntry[]>;

  // Timetable version operations
  createTimetableVersion(version: InsertTimetableVersion): Promise<TimetableVersion>;
  getTimetableVersionsForClass(classId: string, weekStart: string, weekEnd: string): Promise<TimetableVersion[]>;
  getTimetableEntriesForVersion(versionId: string): Promise<TimetableEntry[]>;
  setActiveVersion(versionId: string, classId: string): Promise<void>;
  getActiveTimetableVersion(classId: string, weekStart: string, weekEnd: string): Promise<TimetableVersion | null>;

  // Substitution operations
  getSubstitutions(): Promise<Substitution[]>;
  getSubstitution(id: string): Promise<Substitution | undefined>;
  createSubstitution(substitution: InsertSubstitution): Promise<Substitution>;
  updateSubstitution(id: string, substitution: Partial<InsertSubstitution>): Promise<Substitution>;
  deleteSubstitution(id: string): Promise<void>;
  getActiveSubstitutions(): Promise<Substitution[]>;

  // Timetable validity period operations
  getTimetableValidityPeriods(classId?: string): Promise<TimetableValidityPeriod[]>;
  getTimetableValidityPeriod(id: string): Promise<TimetableValidityPeriod | undefined>;
  createTimetableValidityPeriod(period: InsertTimetableValidityPeriod): Promise<TimetableValidityPeriod>;
  updateTimetableValidityPeriod(id: string, period: Partial<InsertTimetableValidityPeriod>): Promise<TimetableValidityPeriod>;
  deleteTimetableValidityPeriod(id: string): Promise<void>;

  // Teacher attendance operations
  getTeacherAttendance(schoolId: string, date?: string): Promise<TeacherAttendance[]>;
  getTeacherAttendanceByTeacher(teacherId: string, startDate?: string, endDate?: string): Promise<TeacherAttendance[]>;
  markTeacherAttendance(attendance: InsertTeacherAttendance): Promise<TeacherAttendance>;
  markBulkTeacherAttendance(bulkData: BulkAttendanceData, markedBy: string): Promise<TeacherAttendance[]>;
  updateTeacherAttendance(id: string, attendance: Partial<InsertTeacherAttendance>): Promise<TeacherAttendance>;
  deleteTeacherAttendance(id: string): Promise<void>;
  isTeacherAbsent(teacherId: string, date: string): Promise<boolean>;

  // Timetable Structure operations
  getTimetableStructures(schoolId?: string): Promise<TimetableStructure[]>;
  getTimetableStructure(id: string): Promise<TimetableStructure | undefined>;
  getTimetableStructureBySchool(schoolId: string): Promise<TimetableStructure | undefined>;
  createTimetableStructure(structure: InsertTimetableStructure): Promise<TimetableStructure>;
  updateTimetableStructure(id: string, structure: Partial<InsertTimetableStructure>): Promise<TimetableStructure>;
  deleteTimetableStructure(id: string): Promise<void>;

  // Analytics
  getStats(schoolId: string): Promise<{
    totalTeachers: number;
    totalClasses: number;
    totalSubjects: number;
    todaySubstitutions: number;
  }>;
  
  getAdminDashboardStats(): Promise<{
    totalSchools: number;
    activeSchools: number;
    inactiveSchools: number;
    schoolAdminLogins: Array<{
      schoolName: string;
      adminName: string;
      lastLogin: Date | null;
    }>;
    schoolTeacherCounts: Array<{
      schoolName: string;
      activeTeachers: number;
    }>;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUsersBySchoolId(schoolId: string): Promise<User[]> {
    return await db.select().from(users).where(eq(users.schoolId, schoolId));
  }

  async createUser(userData: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async updateUser(id: string, userData: Partial<InsertUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...userData, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // School operations
  async getSchools(): Promise<School[]> {
    return await db.select().from(schools);
  }

  async getSchoolsWithAdminEmails(): Promise<(School & { adminEmail?: string })[]> {
    const schoolsWithAdmins = await db
      .select({
        id: schools.id,
        name: schools.name,
        address: schools.address,
        contactPhone: schools.contactPhone,
        adminName: schools.adminName,
        isActive: schools.isActive,
        createdAt: schools.createdAt,
        updatedAt: schools.updatedAt,
        adminEmail: users.email,
      })
      .from(schools)
      .leftJoin(users, and(eq(schools.id, users.schoolId), eq(users.role, "admin")));
    
    return schoolsWithAdmins.map(school => ({
      ...school,
      adminEmail: school.adminEmail || undefined
    }));
  }

  async getSchool(id: string): Promise<School | undefined> {
    const [school] = await db.select().from(schools).where(eq(schools.id, id));
    return school;
  }

  async createSchool(schoolData: InsertSchool): Promise<School> {
    const [school] = await db.insert(schools).values(schoolData).returning();
    return school;
  }

  async updateSchool(id: string, schoolData: Partial<InsertSchool>): Promise<School> {
    const [school] = await db
      .update(schools)
      .set({ ...schoolData, updatedAt: new Date() })
      .where(eq(schools.id, id))
      .returning();
    
    if (!school) {
      throw new Error(`School with id ${id} not found`);
    }
    
    return school;
  }

  async deleteSchool(id: string): Promise<void> {
    await db.delete(schools).where(eq(schools.id, id));
  }

  // Teacher operations
  async getTeachers(schoolId?: string): Promise<Teacher[]> {
    if (schoolId) {
      return await db.select().from(teachers).where(
        and(eq(teachers.isActive, true), eq(teachers.schoolId, schoolId))
      );
    }
    return await db.select().from(teachers).where(eq(teachers.isActive, true));
  }

  async getTeacher(id: string): Promise<Teacher | undefined> {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.id, id));
    return teacher;
  }

  async getTeacherCountBySchool(schoolId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(teachers)
      .where(and(eq(teachers.schoolId, schoolId), eq(teachers.isActive, true)));
    return result[0]?.count || 0;
  }

  async createTeacher(teacher: InsertTeacher): Promise<Teacher> {
    const insertData: any = { ...teacher };
    if (teacher.subjects) {
      insertData.subjects = teacher.subjects;
    }
    const [created] = await db.insert(teachers).values(insertData).returning();
    return created;
  }

  async updateTeacher(id: string, teacher: Partial<InsertTeacher>): Promise<Teacher> {
    const updateData: any = { ...teacher, updatedAt: new Date() };
    if (teacher.subjects) {
      updateData.subjects = teacher.subjects; // Keep as array, don't stringify
    }
    const [updated] = await db
      .update(teachers)
      .set(updateData)
      .where(eq(teachers.id, id))
      .returning();
    return updated;
  }

  async deleteTeacher(id: string): Promise<void> {
    await db.update(teachers).set({ isActive: false }).where(eq(teachers.id, id));
  }

  async getAvailableTeachers(day: string, period: number, subjectId: string, schoolId: string): Promise<Teacher[]> {
    // Get teachers who teach this subject and are not already assigned in this time slot
    const assignedTeachers = await db
      .select({ id: timetableEntries.teacherId })
      .from(timetableEntries)
      .where(
        and(
          eq(timetableEntries.day, day as any),
          eq(timetableEntries.period, period),
          eq(timetableEntries.isActive, true)
        )
      );

    const assignedIds = assignedTeachers.map(t => t.id);

    return await db
      .select()
      .from(teachers)
      .where(
        and(
          eq(teachers.isActive, true),
          eq(teachers.schoolId, schoolId),
          assignedIds.length > 0 ? sql`${teachers.id} NOT IN ${assignedIds}` : sql`TRUE`,
          sql`${teachers.subjects} ? ${subjectId}`
        )
      );
  }

  // Subject operations
  async getSubjects(schoolId?: string): Promise<Subject[]> {
    if (schoolId) {
      return await db.select().from(subjects).where(eq(subjects.schoolId, schoolId));
    }
    return await db.select().from(subjects);
  }

  async getSubject(id: string): Promise<Subject | undefined> {
    const [subject] = await db.select().from(subjects).where(eq(subjects.id, id));
    return subject;
  }

  async createSubject(subject: InsertSubject): Promise<Subject> {
    const [created] = await db.insert(subjects).values(subject).returning();
    return created;
  }

  async updateSubject(id: string, subject: Partial<InsertSubject>): Promise<Subject> {
    const [updated] = await db
      .update(subjects)
      .set({ ...subject, updatedAt: new Date() })
      .where(eq(subjects.id, id))
      .returning();
    return updated;
  }

  async deleteSubject(id: string): Promise<void> {
    await db.delete(subjects).where(eq(subjects.id, id));
  }

  async checkSubjectCodeExists(code: string, schoolId: string, excludeId?: string): Promise<boolean> {
    const conditions = [eq(subjects.code, code), eq(subjects.schoolId, schoolId)];
    if (excludeId) {
      conditions.push(ne(subjects.id, excludeId));
    }
    
    const [existing] = await db.select().from(subjects).where(and(...conditions)).limit(1);
    return !!existing;
  }

  // Class operations
  async getClasses(schoolId?: string): Promise<Class[]> {
    if (schoolId) {
      return await db.select().from(classes).where(eq(classes.schoolId, schoolId));
    }
    return await db.select().from(classes);
  }

  async getClass(id: string): Promise<Class | undefined> {
    const [classData] = await db.select().from(classes).where(eq(classes.id, id));
    return classData;
  }

  async createClass(classData: InsertClass): Promise<Class> {
    const [created] = await db.insert(classes).values({
      ...classData,
      requiredSubjects: JSON.stringify(classData.requiredSubjects || []) as any,
    }).returning();
    return created;
  }

  async updateClass(id: string, classData: Partial<InsertClass>): Promise<Class> {
    const updateData: any = { ...classData, updatedAt: new Date() };
    if (classData.requiredSubjects) {
      updateData.requiredSubjects = JSON.stringify(classData.requiredSubjects);
    }
    const [updated] = await db
      .update(classes)
      .set(updateData)
      .where(eq(classes.id, id))
      .returning();
    return updated;
  }

  async deleteClass(id: string): Promise<void> {
    await db.delete(classes).where(eq(classes.id, id));
  }

  async checkClassExists(grade: string, section: string | null, schoolId: string, excludeId?: string): Promise<boolean> {
    const conditions = [
      eq(classes.grade, grade),
      eq(classes.schoolId, schoolId),
      section ? eq(classes.section, section) : sql`${classes.section} IS NULL`
    ];
    
    if (excludeId) {
      conditions.push(sql`${classes.id} != ${excludeId}`);
    }
    
    const result = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(...conditions));
    
    return result.length > 0;
  }

  // Timetable operations
  async getTimetableEntries(schoolId?: string): Promise<TimetableEntry[]> {
    if (schoolId) {
      return await db
        .select()
        .from(timetableEntries)
        .innerJoin(classes, eq(timetableEntries.classId, classes.id))
        .where(and(
          eq(timetableEntries.isActive, true),
          eq(classes.schoolId, schoolId)
        ));
    }
    return await db
      .select()
      .from(timetableEntries)
      .where(eq(timetableEntries.isActive, true));
  }

  async getTimetableForClass(classId: string): Promise<TimetableEntry[]> {
    return await db
      .select()
      .from(timetableEntries)
      .where(
        and(
          eq(timetableEntries.classId, classId),
          eq(timetableEntries.isActive, true)
        )
      );
  }

  async getTimetableForTeacher(teacherId: string): Promise<TimetableEntry[]> {
    return await db
      .select()
      .from(timetableEntries)
      .where(
        and(
          eq(timetableEntries.teacherId, teacherId),
          eq(timetableEntries.isActive, true)
        )
      );
  }

  async createTimetableEntry(entry: InsertTimetableEntry): Promise<TimetableEntry> {
    const [created] = await db.insert(timetableEntries).values(entry).returning();
    return created;
  }

  async updateTimetableEntry(id: string, entry: Partial<InsertTimetableEntry>): Promise<TimetableEntry> {
    const [updated] = await db
      .update(timetableEntries)
      .set({ ...entry, updatedAt: new Date() })
      .where(eq(timetableEntries.id, id))
      .returning();
    return updated;
  }

  async deleteTimetableEntry(id: string): Promise<void> {
    await db.delete(timetableEntries).where(eq(timetableEntries.id, id));
  }

  async clearTimetable(): Promise<void> {
    await db.delete(timetableEntries);
  }

  async bulkCreateTimetableEntries(entries: InsertTimetableEntry[]): Promise<TimetableEntry[]> {
    if (entries.length === 0) return [];
    
    // Before creating new entries, deactivate ALL old entries for these classes
    const classIds = Array.from(new Set(entries.map(e => e.classId)));
    for (let i = 0; i < classIds.length; i++) {
      const classId = classIds[i];
      // Deactivate ALL existing entries for this class to prevent duplicates
      await db
        .update(timetableEntries)
        .set({ isActive: false })
        .where(eq(timetableEntries.classId, classId));
    }
    
    return await db.insert(timetableEntries).values(entries).returning();
  }

  // Timetable version operations
  async createTimetableVersion(version: InsertTimetableVersion): Promise<TimetableVersion> {
    const [created] = await db.insert(timetableVersions).values(version).returning();
    return created;
  }

  async getTimetableVersionsForClass(classId: string, weekStart: string, weekEnd: string): Promise<TimetableVersion[]> {
    return await db
      .select()
      .from(timetableVersions)
      .where(
        and(
          eq(timetableVersions.classId, classId),
          eq(timetableVersions.weekStart, weekStart),
          eq(timetableVersions.weekEnd, weekEnd)
        )
      )
      .orderBy(timetableVersions.createdAt);
  }

  async getTimetableEntriesForVersion(versionId: string): Promise<TimetableEntry[]> {
    return await db
      .select()
      .from(timetableEntries)
      .where(eq(timetableEntries.versionId, versionId));
  }

  async setActiveVersion(versionId: string, classId: string): Promise<void> {
    // First, deactivate all versions for this class
    const version = await db
      .select()
      .from(timetableVersions)
      .where(eq(timetableVersions.id, versionId))
      .limit(1);
    
    if (version.length > 0) {
      const { weekStart, weekEnd } = version[0];
      
      // Deactivate all existing versions for this class/week
      await db
        .update(timetableVersions)
        .set({ isActive: false })
        .where(
          and(
            eq(timetableVersions.classId, classId),
            eq(timetableVersions.weekStart, weekStart),
            eq(timetableVersions.weekEnd, weekEnd)
          )
        );

      // Then activate ONLY the selected version
      await db
        .update(timetableVersions)
        .set({ isActive: true })
        .where(eq(timetableVersions.id, versionId));
      
      // Safety check: Ensure only one version is active for this class/week
      const activeCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(timetableVersions)
        .where(
          and(
            eq(timetableVersions.classId, classId),
            eq(timetableVersions.weekStart, weekStart),
            eq(timetableVersions.weekEnd, weekEnd),
            eq(timetableVersions.isActive, true)
          )
        );
      
      if (activeCount[0].count > 1) {
        console.error(`ERROR: Multiple active versions detected for class ${classId}, week ${weekStart}-${weekEnd}. Count: ${activeCount[0].count}`);
        // Force fix by deactivating all and activating only the requested version
        await db
          .update(timetableVersions)
          .set({ isActive: false })
          .where(
            and(
              eq(timetableVersions.classId, classId),
              eq(timetableVersions.weekStart, weekStart),
              eq(timetableVersions.weekEnd, weekEnd)
            )
          );
        await db
          .update(timetableVersions)
          .set({ isActive: true })
          .where(eq(timetableVersions.id, versionId));
      }
    }
  }

  async getActiveTimetableVersion(classId: string, weekStart: string, weekEnd: string): Promise<TimetableVersion | null> {
    const versions = await db
      .select()
      .from(timetableVersions)
      .where(
        and(
          eq(timetableVersions.classId, classId),
          eq(timetableVersions.weekStart, weekStart),
          eq(timetableVersions.weekEnd, weekEnd),
          eq(timetableVersions.isActive, true)
        )
      )
      .limit(1);
    
    return versions.length > 0 ? versions[0] : null;
  }

  // Substitution operations
  async getSubstitutions(schoolId?: string): Promise<Substitution[]> {
    if (schoolId) {
      return await db
        .select({
          id: substitutions.id,
          date: substitutions.date,
          originalTeacherId: substitutions.originalTeacherId,
          substituteTeacherId: substitutions.substituteTeacherId,
          timetableEntryId: substitutions.timetableEntryId,
          reason: substitutions.reason,
          status: substitutions.status,
          createdAt: substitutions.createdAt,
          updatedAt: substitutions.updatedAt,
        })
        .from(substitutions)
        .innerJoin(teachers, eq(substitutions.originalTeacherId, teachers.id))
        .where(eq(teachers.schoolId, schoolId));
    }
    return await db.select().from(substitutions);
  }

  async getSubstitution(id: string): Promise<Substitution | undefined> {
    const [substitution] = await db.select().from(substitutions).where(eq(substitutions.id, id));
    return substitution;
  }

  async createSubstitution(substitution: InsertSubstitution): Promise<Substitution> {
    const [created] = await db.insert(substitutions).values(substitution).returning();
    return created;
  }

  async updateSubstitution(id: string, substitution: Partial<InsertSubstitution>): Promise<Substitution> {
    const [updated] = await db
      .update(substitutions)
      .set({ ...substitution, updatedAt: new Date() })
      .where(eq(substitutions.id, id))
      .returning();
    return updated;
  }

  async deleteSubstitution(id: string): Promise<void> {
    await db.delete(substitutions).where(eq(substitutions.id, id));
  }

  async getActiveSubstitutions(): Promise<Substitution[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return await db
      .select()
      .from(substitutions)
      .where(
        and(
          sql`${substitutions.date} >= ${today}`,
          sql`${substitutions.date} < ${tomorrow}`,
          eq(substitutions.status, "confirmed")
        )
      );
  }

  // Analytics
  async getStats(schoolId: string): Promise<{
    totalTeachers: number;
    totalClasses: number;
    totalSubjects: number;
    todaySubstitutions: number;
  }> {
    const [teacherCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(teachers)
      .where(and(eq(teachers.isActive, true), eq(teachers.schoolId, schoolId)));

    const [classCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(classes)
      .where(eq(classes.schoolId, schoolId));

    const [subjectCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(subjects)
      .where(eq(subjects.schoolId, schoolId));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [substitutionCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(substitutions)
      .innerJoin(teachers, eq(substitutions.teacherId, teachers.id))
      .where(
        and(
          eq(teachers.schoolId, schoolId),
          sql`${substitutions.date} >= ${today}`,
          sql`${substitutions.date} < ${tomorrow}`
        )
      );

    return {
      totalTeachers: Number(teacherCount?.count) || 0,
      totalClasses: Number(classCount?.count) || 0,
      totalSubjects: Number(subjectCount?.count) || 0,
      todaySubstitutions: Number(substitutionCount?.count) || 0,
    };
  }

  async getAdminDashboardStats(): Promise<{
    totalSchools: number;
    activeSchools: number;
    inactiveSchools: number;
    schoolAdminLogins: Array<{
      schoolName: string;
      adminName: string;
      lastLogin: Date | null;
    }>;
    schoolTeacherCounts: Array<{
      schoolName: string;
      activeTeachers: number;
    }>;
  }> {
    // Get school counts
    const [totalSchoolsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schools);

    const [activeSchoolsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schools)
      .where(eq(schools.isActive, true));

    const [inactiveSchoolsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schools)
      .where(eq(schools.isActive, false));

    // Get school admin login info
    const schoolAdminLogins = await db
      .select({
        schoolName: schools.name,
        adminName: sql<string>`CONCAT(${users.firstName}, ' ', COALESCE(${users.lastName}, ''))`,
        lastLogin: users.updatedAt, // Using updatedAt as proxy for last activity
      })
      .from(schools)
      .leftJoin(users, and(
        eq(users.schoolId, schools.id),
        eq(users.role, "admin")
      ))
      .orderBy(schools.name);

    // Get teacher counts per school
    const schoolTeacherCounts = await db
      .select({
        schoolName: schools.name,
        activeTeachers: sql<number>`COUNT(${teachers.id})`,
      })
      .from(schools)
      .leftJoin(teachers, and(
        eq(teachers.schoolId, schools.id),
        eq(teachers.isActive, true)
      ))
      .groupBy(schools.id, schools.name)
      .orderBy(schools.name);

    return {
      totalSchools: Number(totalSchoolsResult?.count) || 0,
      activeSchools: Number(activeSchoolsResult?.count) || 0,
      inactiveSchools: Number(inactiveSchoolsResult?.count) || 0,
      schoolAdminLogins: schoolAdminLogins.map(item => ({
        schoolName: item.schoolName,
        adminName: item.adminName || 'No Admin',
        lastLogin: item.lastLogin,
      })),
      schoolTeacherCounts: schoolTeacherCounts.map(item => ({
        schoolName: item.schoolName,
        activeTeachers: Number(item.activeTeachers) || 0,
      })),
    };
  }

  // Timetable validity period operations
  async getTimetableValidityPeriods(classId?: string): Promise<TimetableValidityPeriod[]> {
    if (classId) {
      return await db.select().from(timetableValidityPeriods).where(eq(timetableValidityPeriods.classId, classId));
    }
    return await db.select().from(timetableValidityPeriods);
  }

  async getTimetableValidityPeriod(id: string): Promise<TimetableValidityPeriod | undefined> {
    const [period] = await db.select().from(timetableValidityPeriods).where(eq(timetableValidityPeriods.id, id));
    return period;
  }

  async createTimetableValidityPeriod(period: InsertTimetableValidityPeriod): Promise<TimetableValidityPeriod> {
    // First, deactivate other active periods for this class
    await db
      .update(timetableValidityPeriods)
      .set({ isActive: false })
      .where(and(
        eq(timetableValidityPeriods.classId, period.classId),
        eq(timetableValidityPeriods.isActive, true)
      ));

    const [newPeriod] = await db.insert(timetableValidityPeriods).values(period).returning();
    return newPeriod;
  }

  async updateTimetableValidityPeriod(id: string, period: Partial<InsertTimetableValidityPeriod>): Promise<TimetableValidityPeriod> {
    const [updatedPeriod] = await db
      .update(timetableValidityPeriods)
      .set(period)
      .where(eq(timetableValidityPeriods.id, id))
      .returning();
    return updatedPeriod;
  }

  async deleteTimetableValidityPeriod(id: string): Promise<void> {
    await db.delete(timetableValidityPeriods).where(eq(timetableValidityPeriods.id, id));
  }

  // Class Subject Assignment operations
  async getClassSubjectAssignments(classId?: string, schoolId?: string): Promise<any[]> {
    const query = db
      .select({
        id: classSubjectAssignments.id,
        classId: classSubjectAssignments.classId,
        subjectId: classSubjectAssignments.subjectId,
        weeklyFrequency: classSubjectAssignments.weeklyFrequency,
        assignedTeacherId: classSubjectAssignments.assignedTeacherId,
        subject: {
          id: subjects.id,
          name: subjects.name,
          code: subjects.code,
          color: subjects.color,
          periodsPerWeek: subjects.periodsPerWeek,
          schoolId: subjects.schoolId,
        },
        assignedTeacher: {
          id: teachers.id,
          name: teachers.name,
          email: teachers.email,
          contactNumber: teachers.contactNumber,
          schoolIdNumber: teachers.schoolIdNumber,
          schoolId: teachers.schoolId,
          isActive: teachers.isActive,
        }
      })
      .from(classSubjectAssignments)
      .innerJoin(subjects, eq(classSubjectAssignments.subjectId, subjects.id))
      .leftJoin(teachers, eq(classSubjectAssignments.assignedTeacherId, teachers.id));

    let conditions = [];
    
    if (classId) {
      conditions.push(eq(classSubjectAssignments.classId, classId));
    }
    
    // Add school filtering by joining with classes table
    if (schoolId) {
      const queryWithClassJoin = query.innerJoin(classes, eq(classSubjectAssignments.classId, classes.id));
      conditions.push(eq(classes.schoolId, schoolId));
      
      if (conditions.length > 0) {
        return await queryWithClassJoin.where(and(...conditions));
      }
      return await queryWithClassJoin;
    }
    
    if (conditions.length > 0) {
      return await query.where(and(...conditions));
    }
    return await query;
  }

  async getClassSubjectAssignment(id: string): Promise<ClassSubjectAssignment | undefined> {
    const [assignment] = await db.select().from(classSubjectAssignments).where(eq(classSubjectAssignments.id, id));
    return assignment;
  }

  async createClassSubjectAssignment(assignment: InsertClassSubjectAssignment): Promise<ClassSubjectAssignment> {
    const [newAssignment] = await db.insert(classSubjectAssignments).values(assignment).returning();
    return newAssignment;
  }

  async updateClassSubjectAssignment(id: string, assignment: Partial<InsertClassSubjectAssignment>): Promise<ClassSubjectAssignment> {
    const [updatedAssignment] = await db
      .update(classSubjectAssignments)
      .set(assignment)
      .where(eq(classSubjectAssignments.id, id))
      .returning();
    return updatedAssignment;
  }

  async deleteClassSubjectAssignment(id: string): Promise<void> {
    await db.delete(classSubjectAssignments).where(eq(classSubjectAssignments.id, id));
  }

  async getClassSubjectAssignmentByClassAndSubject(classId: string, subjectId: string): Promise<ClassSubjectAssignment | undefined> {
    const [assignment] = await db
      .select()
      .from(classSubjectAssignments)
      .where(and(
        eq(classSubjectAssignments.classId, classId),
        eq(classSubjectAssignments.subjectId, subjectId)
      ));
    return assignment;
  }

  // Timetable Structure operations
  async getTimetableStructures(schoolId?: string): Promise<TimetableStructure[]> {
    if (schoolId) {
      return await db.select().from(timetableStructures).where(eq(timetableStructures.schoolId, schoolId));
    }
    return await db.select().from(timetableStructures);
  }

  async getTimetableStructure(id: string): Promise<TimetableStructure | undefined> {
    const [structure] = await db.select().from(timetableStructures).where(eq(timetableStructures.id, id));
    return structure;
  }

  async getTimetableStructureBySchool(schoolId: string): Promise<TimetableStructure | undefined> {
    const [structure] = await db
      .select()
      .from(timetableStructures)
      .where(and(
        eq(timetableStructures.schoolId, schoolId),
        eq(timetableStructures.isActive, true)
      ));
    return structure;
  }

  async createTimetableStructure(structure: InsertTimetableStructure): Promise<TimetableStructure> {
    // First, deactivate other active structures for this school
    await db
      .update(timetableStructures)
      .set({ isActive: false })
      .where(and(
        eq(timetableStructures.schoolId, structure.schoolId),
        eq(timetableStructures.isActive, true)
      ));

    const [newStructure] = await db.insert(timetableStructures).values(structure).returning();
    return newStructure;
  }

  async updateTimetableStructure(id: string, structure: Partial<InsertTimetableStructure>): Promise<TimetableStructure> {
    const [updatedStructure] = await db
      .update(timetableStructures)
      .set(structure)
      .where(eq(timetableStructures.id, id))
      .returning();
    return updatedStructure;
  }

  async deleteTimetableStructure(id: string): Promise<void> {
    await db.delete(timetableStructures).where(eq(timetableStructures.id, id));
  }

  // Teacher attendance operations
  async getTeacherAttendance(schoolId: string, date?: string): Promise<TeacherAttendance[]> {
    const conditions = [eq(teacherAttendance.schoolId, schoolId)];
    
    if (date) {
      conditions.push(eq(teacherAttendance.attendanceDate, date));
    }
    
    return await db
      .select()
      .from(teacherAttendance)
      .where(and(...conditions))
      .orderBy(teacherAttendance.attendanceDate);
  }

  async getTeacherAttendanceByTeacher(teacherId: string, startDate?: string, endDate?: string): Promise<TeacherAttendance[]> {
    const conditions = [eq(teacherAttendance.teacherId, teacherId)];
    
    if (startDate && endDate) {
      conditions.push(between(teacherAttendance.attendanceDate, startDate, endDate));
    } else if (startDate) {
      conditions.push(gte(teacherAttendance.attendanceDate, startDate));
    } else if (endDate) {
      conditions.push(lte(teacherAttendance.attendanceDate, endDate));
    }
    
    return await db
      .select()
      .from(teacherAttendance)
      .where(and(...conditions))
      .orderBy(teacherAttendance.attendanceDate);
  }

  async markTeacherAttendance(attendance: InsertTeacherAttendance): Promise<TeacherAttendance> {
    // Check if attendance already exists for this teacher and date
    const existing = await db
      .select()
      .from(teacherAttendance)
      .where(
        and(
          eq(teacherAttendance.teacherId, attendance.teacherId),
          eq(teacherAttendance.attendanceDate, attendance.attendanceDate)
        )
      );

    if (existing.length > 0) {
      // Update existing record
      const [updated] = await db
        .update(teacherAttendance)
        .set({
          status: attendance.status,
          reason: attendance.reason,
          isFullDay: attendance.isFullDay,
          markedBy: attendance.markedBy,
          markedAt: getCurrentDateTimeIST(),
        })
        .where(eq(teacherAttendance.id, existing[0].id))
        .returning();
      return updated;
    } else {
      // Create new record
      const [created] = await db
        .insert(teacherAttendance)
        .values(attendance)
        .returning();
      return created;
    }
  }

  async markBulkTeacherAttendance(bulkData: BulkAttendanceData, markedBy: string): Promise<TeacherAttendance[]> {
    const { teacherId, status, reason, startDate, endDate, isFullDay } = bulkData;
    const records: TeacherAttendance[] = [];
    
    // Get teacher and school info
    const teacher = await this.getTeacher(teacherId);
    if (!teacher) {
      throw new Error("Teacher not found");
    }

    // Generate date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const currentDate = new Date(start);
    
    while (currentDate <= end) {
      const dateString = currentDate.toISOString().split('T')[0];
      
      try {
        const attendanceRecord = await this.markTeacherAttendance({
          teacherId,
          schoolId: teacher.schoolId,
          attendanceDate: dateString,
          status,
          reason,
          leaveStartDate: startDate,
          leaveEndDate: endDate,
          isFullDay,
          markedBy,
        });
        records.push(attendanceRecord);
      } catch (error) {
        console.error(`Failed to mark attendance for ${dateString}:`, error);
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return records;
  }

  async updateTeacherAttendance(id: string, attendance: Partial<InsertTeacherAttendance>): Promise<TeacherAttendance> {
    const [updated] = await db
      .update(teacherAttendance)
      .set({
        ...attendance,
        updatedAt: getCurrentDateTimeIST(),
      })
      .where(eq(teacherAttendance.id, id))
      .returning();
      
    if (!updated) {
      throw new Error("Teacher attendance record not found");
    }
    
    return updated;
  }

  async deleteTeacherAttendance(id: string): Promise<void> {
    await db.delete(teacherAttendance).where(eq(teacherAttendance.id, id));
  }

  async isTeacherAbsent(teacherId: string, date: string): Promise<boolean> {
    const attendance = await db
      .select()
      .from(teacherAttendance)
      .where(
        and(
          eq(teacherAttendance.teacherId, teacherId),
          eq(teacherAttendance.attendanceDate, date)
        )
      );
    
    if (attendance.length === 0) {
      return false; // No record means present by default
    }
    
    return attendance[0].status !== "present";
  }
}

export const storage = new DatabaseStorage();
