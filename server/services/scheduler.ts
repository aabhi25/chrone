import { storage } from "../storage";
import type { InsertTimetableEntry, Teacher, Subject, Class } from "@shared/schema";

interface TimeSlot {
  day: string;
  period: number;
  startTime: string;
  endTime: string;
}

interface ScheduleConstraint {
  classId: string;
  subjectId: string;
  periodsNeeded: number;
  preferredTeachers: string[];
}

export class TimetableScheduler {
  private timeSlots: TimeSlot[] = [];

  constructor() {
    // Initialize with default slots, will be updated when generating timetable
    this.initializeTimeSlots();
  }

  private async initializeFromStructure(schoolId?: string) {
    try {
      let structure;
      if (schoolId) {
        structure = await storage.getTimetableStructureBySchool(schoolId);
      }
      
      if (structure) {
        this.timeSlots = [];
        const workingDays = structure.workingDays || ["monday", "tuesday", "wednesday", "thursday", "friday"];
        const timeSlots = structure.timeSlots || [
          { period: 1, startTime: "08:00", endTime: "08:45" },
          { period: 2, startTime: "08:45", endTime: "09:30" },
          { period: 3, startTime: "09:30", endTime: "10:15" },
          { period: 4, startTime: "10:15", endTime: "11:00" },
          { period: 5, startTime: "11:15", endTime: "12:00" },
          { period: 6, startTime: "12:00", endTime: "12:45" },
          { period: 7, startTime: "12:45", endTime: "13:30" },
          { period: 8, startTime: "13:30", endTime: "14:15" },
        ];

        for (const day of workingDays) {
          for (const slot of timeSlots) {
            if (!slot.isBreak) { // Skip break periods for scheduling
              this.timeSlots.push({
                day,
                period: slot.period,
                startTime: slot.startTime,
                endTime: slot.endTime,
              });
            }
          }
        }
      }
    } catch (error) {
      console.warn("Could not load timetable structure, using defaults:", error);
      this.initializeTimeSlots();
    }
  }

  private initializeTimeSlots() {
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
    const periodTimes = [
      { period: 1, startTime: "08:00", endTime: "08:45" },
      { period: 2, startTime: "08:45", endTime: "09:30" },
      { period: 3, startTime: "09:30", endTime: "10:15" },
      { period: 4, startTime: "10:15", endTime: "11:00" },
      { period: 5, startTime: "11:15", endTime: "12:00" },
      { period: 6, startTime: "12:00", endTime: "12:45" },
      { period: 7, startTime: "12:45", endTime: "13:30" },
      { period: 8, startTime: "13:30", endTime: "14:15" },
    ];

    for (const day of days) {
      for (const time of periodTimes) {
        this.timeSlots.push({
          day,
          period: time.period,
          startTime: time.startTime,
          endTime: time.endTime,
        });
      }
    }
  }

  async generateTimetable(classId?: string, userSchoolId?: string): Promise<{ success: boolean; message: string; entriesCreated?: number; version?: string }> {
    try {

      // Get all data
      let classes: Class[];
      
      if (classId) {
        // Generate timetable for specific class only
        const singleClass = await storage.getClass(classId);
        if (!singleClass) {
          return {
            success: false,
            message: "Class not found.",
          };
        }
        classes = [singleClass];
      } else {
        // Generate timetable for all classes in user's school
        classes = await storage.getClasses();
        
        // Filter classes to only include those from the user's school
        if (userSchoolId) {
          classes = classes.filter(cls => cls.schoolId === userSchoolId);
        } else {
          // If no user context, we can't determine school - require specific classId
          return {
            success: false,
            message: "Please generate timetable for specific classes.",
          };
        }
      }

      // Get schoolId from the class(es)
      const schoolId = classes[0]?.schoolId;
      
      if (!schoolId) {
        return {
          success: false,
          message: "Classes must be associated with a school.",
        };
      }

      const [subjects, teachers] = await Promise.all([
        storage.getSubjects(),
        storage.getTeachers(schoolId), // Only get teachers from the same school
      ]);



      if (classes.length === 0 || subjects.length === 0 || teachers.length === 0) {
        return {
          success: false,
          message: "Please ensure you have added classes, subjects, and teachers before generating timetable.",
        };
      }
      
      // Initialize time slots from structure
      await this.initializeFromStructure(schoolId);

      // Calculate week range (current week)
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 5); // Saturday

      const weekStart = startOfWeek.toISOString().split('T')[0];
      const weekEnd = endOfWeek.toISOString().split('T')[0];

      let versionsCreated = [];

      // Process each class
      for (const classData of classes) {
        // Get existing versions for this class and week
        const existingVersions = await storage.getTimetableVersionsForClass(classData.id, weekStart, weekEnd);
        
        // Generate new version number
        const newVersionNumber = existingVersions.length + 1;
        const versionString = `v0.${newVersionNumber}`;

        // Create new version
        const newVersion = await storage.createTimetableVersion({
          classId: classData.id,
          version: versionString,
          weekStart,
          weekEnd,
          isActive: true, // New version becomes active
        });

        // Deactivate previous versions for this class and week by calling setActiveVersion with the new version
        // This will automatically deactivate old versions and activate the new one
        await storage.setActiveVersion(newVersion.id, classData.id);

        versionsCreated.push({ 
          classId: classData.id, 
          version: versionString, 
          versionId: newVersion.id 
        });
      }

      // Build constraints
      const constraints = await this.buildConstraints(classes);
      
      // Generate schedule using constraint satisfaction
      const schedule = await this.solveSchedule(constraints, teachers, subjects);

      if (schedule.length === 0) {
        return {
          success: false,
          message: "Unable to generate a valid timetable with current constraints. Please check teacher availability and subject requirements.",
        };
      }

      // Associate schedule entries with their respective versions
      const scheduleWithVersions = schedule.map(entry => {
        const classVersion = versionsCreated.find(v => v.classId === entry.classId);
        
        if (classVersion) {
          return {
            ...entry,
            versionId: classVersion.versionId,
          };
        }
        return entry;
      });

      // Save to database with version associations
      await storage.bulkCreateTimetableEntries(scheduleWithVersions);

      const versionString = versionsCreated.length > 0 ? versionsCreated[0].version : 'v0.1';

      return {
        success: true,
        message: `Timetable generated successfully with ${schedule.length} entries.`,
        entriesCreated: schedule.length,
        version: versionString,
      };
    } catch (error) {
      console.error("Error generating timetable:", error);
      return {
        success: false,
        message: "An error occurred while generating the timetable. Please try again.",
      };
    }
  }

  private async buildConstraints(classes: Class[]): Promise<ScheduleConstraint[]> {
    const constraints: ScheduleConstraint[] = [];

    for (const classData of classes) {
      // Get class subject assignments with weekly frequency
      const assignments = await storage.getClassSubjectAssignments(classData.id);
      
      for (const assignment of assignments) {
        // Get the assigned teacher for this class-subject combination
        const assignedTeachers = assignment.assignedTeacherId ? [assignment.assignedTeacherId] : [];
        
        constraints.push({
          classId: classData.id,
          subjectId: assignment.subjectId,
          periodsNeeded: assignment.weeklyFrequency,
          preferredTeachers: assignedTeachers,
        });
      }
    }

    return constraints;
  }

  private async solveSchedule(
    constraints: ScheduleConstraint[], 
    teachers: Teacher[], 
    subjects: Subject[]
  ): Promise<InsertTimetableEntry[]> {
    const schedule: InsertTimetableEntry[] = [];
    const assignments = new Map<string, Set<string>>(); // classId-day-period -> teacherId
    const dailySubjectCount = new Map<string, Map<string, number>>(); // classId-day-subjectId -> count

    // Helper function to get daily subject count
    const getDailySubjectCount = (classId: string, day: string, subjectId: string): number => {
      const dayKey = `${classId}-${day}`;
      return dailySubjectCount.get(dayKey)?.get(subjectId) || 0;
    };

    // Helper function to increment daily subject count
    const incrementDailySubjectCount = (classId: string, day: string, subjectId: string) => {
      const dayKey = `${classId}-${day}`;
      if (!dailySubjectCount.has(dayKey)) {
        dailySubjectCount.set(dayKey, new Map());
      }
      const dayMap = dailySubjectCount.get(dayKey)!;
      const currentCount = dayMap.get(subjectId) || 0;
      dayMap.set(subjectId, currentCount + 1);
    };

    // Shuffle constraints for more varied scheduling
    const shuffledConstraints = [...constraints].sort(() => Math.random() - 0.5);

    for (const constraint of shuffledConstraints) {
      const subject = subjects.find(s => s.id === constraint.subjectId);
      if (!subject) continue;

      // Find teachers who can teach this subject
      let eligibleTeachers = teachers.filter(t => {
        // Ensure subjects is an array and check if it includes the subject
        const subjectsArray = Array.isArray(t.subjects) ? t.subjects : [];
        return subjectsArray.includes(constraint.subjectId) && t.isActive;
      });

      // If there are preferred/assigned teachers, prioritize them
      if (constraint.preferredTeachers.length > 0) {
        const assignedTeachers = eligibleTeachers.filter(t => 
          constraint.preferredTeachers.includes(t.id)
        );
        
        if (assignedTeachers.length > 0) {
          // Use only assigned teachers for this class-subject combination
          eligibleTeachers = assignedTeachers;
        }
      }

      if (eligibleTeachers.length === 0) {
        const assignedTeacherText = constraint.preferredTeachers.length > 0 
          ? ` (assigned teacher not available or not qualified)`
          : '';
        console.warn(`No teachers available for subject ${subject.name}${assignedTeacherText}`);
        continue;
      }

      let periodsScheduled = 0;
      
      // Sort time slots to prioritize days with fewer instances of this subject first
      const prioritizedTimeSlots = [...this.timeSlots].sort((a, b) => {
        const aCount = getDailySubjectCount(constraint.classId, a.day, constraint.subjectId);
        const bCount = getDailySubjectCount(constraint.classId, b.day, constraint.subjectId);
        // Prioritize days with fewer existing periods of this subject
        if (aCount !== bCount) {
          return aCount - bCount;
        }
        // If equal count, randomize within those days
        return Math.random() - 0.5;
      });

      for (const timeSlot of prioritizedTimeSlots) {
        if (periodsScheduled >= constraint.periodsNeeded) break;

        const slotKey = `${constraint.classId}-${timeSlot.day}-${timeSlot.period}`;
        
        // Check if slot is already occupied for this class
        if (assignments.has(slotKey)) continue;

        // Check daily subject limit - no more than 2 periods of same subject per day
        const currentDailyCount = getDailySubjectCount(constraint.classId, timeSlot.day, constraint.subjectId);
        if (currentDailyCount >= 2) continue;

        // Find available teacher for this slot
        const availableTeacher = eligibleTeachers.find(teacher => {
          // Check if teacher is available in this time slot
          const teacherAvailability = teacher.availability[timeSlot.day as keyof typeof teacher.availability];
          // If no specific availability is set, assume teacher is available during school hours
          if (!teacherAvailability || teacherAvailability.length === 0) {
            // Allow scheduling during school hours if no specific availability is set
            return true;
          }
          if (!teacherAvailability.includes(`${timeSlot.startTime}-${timeSlot.endTime}`)) {
            return false;
          }

          // Check if teacher is not already assigned in this time slot across all classes
          const assignmentKeys = Array.from(assignments.keys());
          for (const slotKey of assignmentKeys) {
            const [, assignedDay, assignedPeriod] = slotKey.split('-');
            if (assignedDay === timeSlot.day && parseInt(assignedPeriod) === timeSlot.period) {
              const assignedTeachers = assignments.get(slotKey);
              if (assignedTeachers && assignedTeachers.has(teacher.id)) {
                return false;
              }
            }
          }
          
          return true;
        });

        if (availableTeacher) {
          // Make assignment
          const assignmentSet = new Set<string>();
          assignmentSet.add(availableTeacher.id);
          assignments.set(slotKey, assignmentSet);

          // Increment daily subject count
          incrementDailySubjectCount(constraint.classId, timeSlot.day, constraint.subjectId);

          schedule.push({
            classId: constraint.classId,
            teacherId: availableTeacher.id,
            subjectId: constraint.subjectId,
            day: timeSlot.day as any,
            period: timeSlot.period,
            startTime: timeSlot.startTime,
            endTime: timeSlot.endTime,
            room: null,
            isActive: true,
          });

          periodsScheduled++;
        }
      }

      if (periodsScheduled < constraint.periodsNeeded) {
        console.warn(
          `Could only schedule ${periodsScheduled}/${constraint.periodsNeeded} periods for ${subject.name}`
        );
      }
    }

    return schedule;
  }

  async validateTimetable(): Promise<{ isValid: boolean; conflicts: string[] }> {
    const conflicts: string[] = [];
    
    try {
      const timetableEntries = await storage.getTimetableEntries();
      
      // Check for teacher double-booking conflicts
      const teacherSchedule = new Map<string, Set<string>>();
      
      for (const entry of timetableEntries) {
        const slotKey = `${entry.day}-${entry.period}`;
        
        if (!teacherSchedule.has(entry.teacherId)) {
          teacherSchedule.set(entry.teacherId, new Set());
        }
        
        const teacherSlots = teacherSchedule.get(entry.teacherId)!;
        
        if (teacherSlots.has(slotKey)) {
          // Find the other class this teacher is assigned to at the same time
          const conflictEntry = timetableEntries.find(e => 
            e.teacherId === entry.teacherId && 
            e.day === entry.day && 
            e.period === entry.period && 
            e.classId !== entry.classId
          );
          
          if (conflictEntry) {
            conflicts.push(
              `Teacher conflict: Teacher ${entry.teacherId} is scheduled for both Class ${entry.classId} and Class ${conflictEntry.classId} on ${entry.day} period ${entry.period}`
            );
          }
        } else {
          teacherSlots.add(slotKey);
        }
      }
      
      // Check for classroom conflicts (if room assignments exist)
      const roomSchedule = new Map<string, Set<string>>();
      
      for (const entry of timetableEntries) {
        if (!entry.room) continue;
        
        const slotKey = `${entry.day}-${entry.period}`;
        
        if (!roomSchedule.has(entry.room)) {
          roomSchedule.set(entry.room, new Set());
        }
        
        const roomSlots = roomSchedule.get(entry.room)!;
        
        if (roomSlots.has(slotKey)) {
          conflicts.push(
            `Room conflict: Room ${entry.room} is double-booked on ${entry.day} period ${entry.period}`
          );
        } else {
          roomSlots.add(slotKey);
        }
      }
      
      // Check if classes have proper subject distribution
      const classSubjectCount = new Map<string, Map<string, number>>();
      
      for (const entry of timetableEntries) {
        if (!classSubjectCount.has(entry.classId)) {
          classSubjectCount.set(entry.classId, new Map());
        }
        
        const subjectCount = classSubjectCount.get(entry.classId)!;
        const currentCount = subjectCount.get(entry.subjectId) || 0;
        subjectCount.set(entry.subjectId, currentCount + 1);
      }
      
      // Check against required weekly frequencies
      const classes = await storage.getClasses();
      
      for (const classData of classes) {
        const assignments = await storage.getClassSubjectAssignments(classData.id);
        const actualCounts = classSubjectCount.get(classData.id) || new Map();
        
        for (const assignment of assignments) {
          const actualCount = actualCounts.get(assignment.subjectId) || 0;
          
          if (actualCount < assignment.weeklyFrequency) {
            conflicts.push(
              `Insufficient periods: Class ${classData.grade}-${classData.section} needs ${assignment.weeklyFrequency} periods of ${assignment.subject?.name || 'Unknown Subject'} but only has ${actualCount}`
            );
          }
          
          if (actualCount > assignment.weeklyFrequency) {
            conflicts.push(
              `Excess periods: Class ${classData.grade}-${classData.section} has ${actualCount} periods of ${assignment.subject?.name || 'Unknown Subject'} but only needs ${assignment.weeklyFrequency}`
            );
          }
        }
      }
      
    } catch (error) {
      console.error("Error validating timetable:", error);
      conflicts.push("Unable to validate timetable due to system error");
    }
    
    return {
      isValid: conflicts.length === 0,
      conflicts,
    };
  }

  async suggestOptimizations(): Promise<string[]> {
    const suggestions: string[] = [];
    
    try {
      const [timetableEntries, teachers] = await Promise.all([
        storage.getTimetableEntries(),
        storage.getTeachers(),
      ]);

      // Check teacher workload distribution
      const teacherWorkload = new Map<string, number>();
      for (const entry of timetableEntries) {
        const current = teacherWorkload.get(entry.teacherId) || 0;
        teacherWorkload.set(entry.teacherId, current + 1);
      }

      const workloads = Array.from(teacherWorkload.values());
      const avgWorkload = workloads.reduce((a, b) => a + b, 0) / workloads.length;
      const maxWorkload = Math.max(...workloads);
      const minWorkload = Math.min(...workloads);

      if (maxWorkload - minWorkload > avgWorkload * 0.3) {
        suggestions.push("Consider redistributing teacher workload for better balance.");
      }

      // Check for morning vs afternoon distribution
      const morningPeriods = timetableEntries.filter(e => e.period <= 4).length;
      const afternoonPeriods = timetableEntries.filter(e => e.period >= 5).length;
      
      if (afternoonPeriods > morningPeriods * 1.5) {
        suggestions.push("Consider moving some subjects to morning hours for better student engagement.");
      }

      // Check for consecutive same subjects
      const dailySchedules = new Map<string, Map<string, string[]>>();
      for (const entry of timetableEntries) {
        if (!dailySchedules.has(entry.classId)) {
          dailySchedules.set(entry.classId, new Map());
        }
        const classSchedule = dailySchedules.get(entry.classId)!;
        if (!classSchedule.has(entry.day)) {
          classSchedule.set(entry.day, []);
        }
        classSchedule.get(entry.day)!.push(entry.subjectId);
      }

      let hasConsecutiveSameSubjects = false;
      dailySchedules.forEach((schedule, classId) => {
        schedule.forEach((subjects, day) => {
          for (let i = 0; i < subjects.length - 1; i++) {
            if (subjects[i] === subjects[i + 1]) {
              hasConsecutiveSameSubjects = true;
              return;
            }
          }
        });
      });

      if (hasConsecutiveSameSubjects) {
        suggestions.push("Avoid scheduling the same subject in consecutive periods for better learning outcomes.");
      }

      if (suggestions.length === 0) {
        suggestions.push("Current timetable appears well-optimized. No major issues detected.");
      }

    } catch (error) {
      console.error("Error generating optimization suggestions:", error);
      suggestions.push("Unable to analyze timetable for optimization opportunities.");
    }

    return suggestions;
  }
}

export const scheduler = new TimetableScheduler();
