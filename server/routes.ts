import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scheduler } from "./services/scheduler";
import { CSVProcessor } from "./services/csvProcessor";
import { 
  insertTeacherSchema, 
  insertSubjectSchema, 
  insertClassSchema,
  updateClassSchema,
  insertSubstitutionSchema,
  insertSchoolSchema,
  insertClassSubjectAssignmentSchema,
  insertTimetableStructureSchema,
  insertTeacherAttendanceSchema,
  bulkAttendanceSchema
} from "@shared/schema";
import multer from "multer";
import { setupCustomAuth, authenticateToken as authMiddleware } from "./auth";

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Setup custom authentication
  setupCustomAuth(app);

  // Auth routes
  app.get('/api/auth/user', authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      // Don't send password hash to client
      const { passwordHash, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Update user profile
  app.put('/api/auth/profile', authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { firstName, lastName, email } = req.body;
      
      // Validate input
      if (!firstName?.trim()) {
        return res.status(400).json({ message: "First name is required" });
      }
      
      if (!email?.trim()) {
        return res.status(400).json({ message: "Email is required" });
      }
      
      // Check if email is already taken by another user
      if (email !== req.user.email) {
        const existingUser = await storage.getUserByEmail(email);
        if (existingUser && existingUser.id !== userId) {
          return res.status(400).json({ message: "Email is already in use" });
        }
      }
      
      // Update user profile
      const updatedUser = await storage.updateUser(userId, {
        firstName: firstName.trim(),
        lastName: lastName?.trim() || null,
        email: email.trim(),
      });
      
      // Don't send password hash to client
      const { passwordHash, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Change user password
  app.put('/api/auth/password', authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword } = req.body;
      
      // Validate input
      if (!currentPassword) {
        return res.status(400).json({ message: "Current password is required" });
      }
      
      if (!newPassword) {
        return res.status(400).json({ message: "New password is required" });
      }
      
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }
      
      // Verify current password
      const bcrypt = await import('bcryptjs');
      const isCurrentPasswordValid = await bcrypt.default.compare(currentPassword, req.user.passwordHash);
      
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      
      // Hash new password
      const hashedNewPassword = await bcrypt.default.hash(newPassword, 12);
      
      // Update password
      await storage.updateUser(userId, {
        passwordHash: hashedNewPassword,
        passwordChangedAt: new Date(),
      });
      
      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // Get school information for school admin
  app.get('/api/school-info', authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins can access this endpoint
      if (user.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }
      
      if (!user.schoolId) {
        return res.status(400).json({ message: "User is not associated with a school" });
      }
      
      const school = await storage.getSchool(user.schoolId);
      if (!school) {
        return res.status(404).json({ message: "School not found" });
      }
      
      // Get teacher count for this school
      const teacherCount = await storage.getTeacherCountBySchool(user.schoolId);
      
      res.json({
        ...school,
        totalTeachers: teacherCount
      });
    } catch (error) {
      console.error("Error fetching school info:", error);
      res.status(500).json({ message: "Failed to fetch school information" });
    }
  });

  // School management endpoints (Super Admin only)
  app.get("/api/schools", authMiddleware, async (req, res) => {
    try {
      if (req.user?.role !== "super_admin") {
        return res.status(403).json({ message: "Access denied. Super Admin required." });
      }
      const schools = await storage.getSchoolsWithAdminEmails();
      res.json(schools);
    } catch (error) {
      console.error("Error fetching schools:", error);
      res.status(500).json({ message: "Failed to fetch schools" });
    }
  });

  app.post("/api/schools", authMiddleware, async (req, res) => {
    try {
      if (req.user?.role !== "super_admin") {
        return res.status(403).json({ message: "Access denied. Super Admin required." });
      }
      
      const { adminEmail, adminPassword, adminName, ...schoolData } = req.body;
      
      // Validate school data
      const validatedSchoolData = insertSchoolSchema.parse({
        ...schoolData,
        adminName
      });
      
      // Create school first
      const school = await storage.createSchool(validatedSchoolData);
      
      // Create admin account if credentials provided
      if (adminEmail && adminPassword) {
        const bcrypt = await import('bcryptjs');
        const hashedPassword = await bcrypt.default.hash(adminPassword, 12);
        await storage.createUser({
          email: adminEmail,
          passwordHash: hashedPassword,
          role: "admin",
          schoolId: school.id,
          firstName: adminName,
          lastName: null,
          teacherId: null
        });
      }
      
      res.status(201).json(school);
    } catch (error) {
      console.error("Error creating school:", error);
      res.status(400).json({ message: "Invalid school data" });
    }
  });

  app.put("/api/schools/:id", authMiddleware, async (req, res) => {
    try {
      if (req.user?.role !== "super_admin") {
        return res.status(403).json({ message: "Access denied. Super Admin required." });
      }
      
      const { adminEmail, adminPassword, adminName, ...schoolData } = req.body;
      
      // Validate school data
      const validatedSchoolData = insertSchoolSchema.partial().parse({
        ...schoolData,
        adminName
      });
      
      // Update school first
      const school = await storage.updateSchool(req.params.id, validatedSchoolData);
      
      // Update admin account if new password provided
      if (adminEmail && adminPassword) {
        const bcrypt = await import('bcryptjs');
        const hashedPassword = await bcrypt.default.hash(adminPassword, 12);
        
        // Try to find existing admin user for this school
        try {
          const existingUsers = await storage.getUsersBySchoolId(req.params.id);
          const existingAdmin = existingUsers.find(user => user.role === "admin");
          
          if (existingAdmin) {
            // Update existing admin
            await storage.updateUser(existingAdmin.id, {
              email: adminEmail,
              passwordHash: hashedPassword,
              firstName: adminName,
            });
          } else {
            // Create new admin if none exists
            await storage.createUser({
              email: adminEmail,
              passwordHash: hashedPassword,
              role: "admin",
              schoolId: school.id,
              firstName: adminName,
              lastName: null,
              teacherId: null
            });
          }
        } catch (error) {
          console.error("Error managing admin account:", error);
          // Continue without failing the school update
        }
      }
      
      res.json(school);
    } catch (error) {
      console.error("Error updating school:", error);
      res.status(400).json({ message: "Invalid school data" });
    }
  });

  // Update school status (activate/deactivate)
  app.patch("/api/schools/:id/status", authMiddleware, async (req, res) => {
    try {
      if (req.user?.role !== "super_admin") {
        return res.status(403).json({ message: "Access denied. Super Admin required." });
      }

      const { id } = req.params;
      const { isActive } = req.body;
      
      console.log(`Updating school ${id} status to ${isActive}`);
      
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ message: "isActive must be a boolean value" });
      }

      const updatedSchool = await storage.updateSchool(id, { isActive });
      
      console.log('Updated school:', updatedSchool);
      
      res.json(updatedSchool);
    } catch (error) {
      console.error("Error updating school status:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ message: "Failed to update school status", error: errorMessage });
    }
  });

  // Stats endpoint (protected)
  app.get("/api/stats", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      const stats = await storage.getStats(user.schoolId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Admin dashboard stats endpoint (super admin only)
  app.get("/api/admin/dashboard-stats", authMiddleware, async (req, res) => {
    try {
      // Only super admins can access this endpoint
      if (req.user?.role !== "super_admin") {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const stats = await storage.getAdminDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching admin dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch admin dashboard stats" });
    }
  });

  // Teacher endpoints (school-filtered for non-super-admin users)
  app.get("/api/teachers", authMiddleware, async (req, res) => {
    try {
      const user = req.user;
      let teachers;
      
      if (user?.role === "super_admin") {
        // Super admin can see all teachers
        teachers = await storage.getTeachers();
      } else if (user?.schoolId) {
        // School admin and teachers can only see their school's teachers
        teachers = await storage.getTeachers(user.schoolId);
      } else {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(teachers);
    } catch (error) {
      console.error("Error fetching teachers:", error);
      res.status(500).json({ message: "Failed to fetch teachers" });
    }
  });

  app.get("/api/teachers/:id", async (req, res) => {
    try {
      const teacher = await storage.getTeacher(req.params.id);
      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }
      res.json(teacher);
    } catch (error) {
      console.error("Error fetching teacher:", error);
      res.status(500).json({ message: "Failed to fetch teacher" });
    }
  });

  app.post("/api/teachers", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can create teachers
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const requestBody = { ...req.body };
      
      // For school admins, ensure the teacher belongs to their school
      if (user.role === 'admin') {
        if (!user.schoolId) {
          return res.status(400).json({ message: "User is not associated with a school" });
        }
        requestBody.schoolId = user.schoolId;
      } else if (user.role === 'super_admin') {
        // Super admin must provide schoolId
        if (!requestBody.schoolId) {
          return res.status(400).json({ message: "School ID is required for super admin" });
        }
      }

      const validatedData = insertTeacherSchema.parse(requestBody);
      const teacher = await storage.createTeacher(validatedData);
      res.status(201).json(teacher);
    } catch (error) {
      console.error("Error creating teacher:", error);
      
      // Handle specific database errors
      if (error && typeof error === 'object' && 'code' in error && 'constraint' in error) {
        if (error.code === '23505' && error.constraint === 'teachers_email_unique') {
          return res.status(400).json({ message: "A teacher with this email already exists" });
        }
      }
      
      res.status(400).json({ message: "Invalid teacher data" });
    }
  });

  app.put("/api/teachers/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      const teacherId = req.params.id;
      
      // Only school admins and super admins can update teachers
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if teacher exists and belongs to the user's school (for school admins)
      const existingTeacher = await storage.getTeacher(teacherId);
      if (!existingTeacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }

      if (user.role === 'admin' && user.schoolId && existingTeacher.schoolId !== user.schoolId) {
        return res.status(403).json({ message: "Access denied - teacher not in your school" });
      }

      const validatedData = insertTeacherSchema.partial().parse(req.body);
      
      // Ensure school ID cannot be changed by school admins
      if (user.role === 'admin') {
        delete validatedData.schoolId;
      }

      const teacher = await storage.updateTeacher(teacherId, validatedData);
      res.json(teacher);
    } catch (error) {
      console.error("Error updating teacher:", error);
      res.status(400).json({ message: "Failed to update teacher" });
    }
  });

  app.delete("/api/teachers/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      const teacherId = req.params.id;
      
      // Only school admins and super admins can delete teachers
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if teacher exists and belongs to the user's school (for school admins)
      const existingTeacher = await storage.getTeacher(teacherId);
      if (!existingTeacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }

      if (user.role === 'admin' && user.schoolId && existingTeacher.schoolId !== user.schoolId) {
        return res.status(403).json({ message: "Access denied - teacher not in your school" });
      }

      await storage.deleteTeacher(teacherId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting teacher:", error);
      res.status(500).json({ message: "Failed to delete teacher" });
    }
  });

  // Teacher Attendance routes
  app.get("/api/teacher-attendance", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      const { date, teacherId } = req.query;
      
      // Only school admins and super admins can view attendance
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      let attendance;
      
      if (teacherId) {
        // Get attendance for specific teacher
        attendance = await storage.getTeacherAttendanceByTeacher(teacherId as string);
      } else if (user.schoolId) {
        // Get attendance for the school
        attendance = await storage.getTeacherAttendance(user.schoolId, date as string);
      } else {
        return res.status(400).json({ message: "School ID is required" });
      }
      
      res.json(attendance);
    } catch (error) {
      console.error("Error fetching teacher attendance:", error);
      res.status(500).json({ message: "Failed to fetch teacher attendance" });
    }
  });

  app.post("/api/teacher-attendance", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can mark attendance
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const requestBody = { ...req.body };
      
      // Add marked by information
      requestBody.markedBy = user.id;
      
      // For school admins, ensure the attendance belongs to their school
      if (user.role === 'admin') {
        if (!user.schoolId) {
          return res.status(400).json({ message: "User is not associated with a school" });
        }
        requestBody.schoolId = user.schoolId;
      }

      const validatedData = insertTeacherAttendanceSchema.parse(requestBody);
      const attendance = await storage.markTeacherAttendance(validatedData);
      res.status(201).json(attendance);
    } catch (error) {
      console.error("Error marking teacher attendance:", error);
      res.status(500).json({ message: "Failed to mark teacher attendance" });
    }
  });

  app.post("/api/teacher-attendance/bulk", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can mark bulk attendance
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const validatedData = bulkAttendanceSchema.parse(req.body);
      
      // Verify teacher belongs to the user's school (for school admins)
      if (user.role === 'admin') {
        const teacher = await storage.getTeacher(validatedData.teacherId);
        if (!teacher || teacher.schoolId !== user.schoolId) {
          return res.status(403).json({ message: "Teacher not found or not in your school" });
        }
      }

      const attendanceRecords = await storage.markBulkTeacherAttendance(validatedData, user.id);
      res.status(201).json(attendanceRecords);
    } catch (error) {
      console.error("Error marking bulk teacher attendance:", error);
      res.status(500).json({ message: "Failed to mark bulk teacher attendance" });
    }
  });

  app.put("/api/teacher-attendance/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      const attendanceId = req.params.id;
      
      // Only school admins and super admins can update attendance
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const requestBody = { ...req.body };
      requestBody.markedBy = user.id; // Update who modified it
      
      const validatedData = insertTeacherAttendanceSchema.partial().parse(requestBody);
      const attendance = await storage.updateTeacherAttendance(attendanceId, validatedData);
      res.json(attendance);
    } catch (error) {
      console.error("Error updating teacher attendance:", error);
      res.status(500).json({ message: "Failed to update teacher attendance" });
    }
  });

  app.delete("/api/teacher-attendance/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      const attendanceId = req.params.id;
      
      // Only school admins and super admins can delete attendance
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deleteTeacherAttendance(attendanceId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting teacher attendance:", error);
      res.status(500).json({ message: "Failed to delete teacher attendance" });
    }
  });

  // Check if teacher is absent on a specific date
  app.get("/api/teacher-attendance/check/:teacherId/:date", authMiddleware, async (req: any, res) => {
    try {
      const { teacherId, date } = req.params;
      const isAbsent = await storage.isTeacherAbsent(teacherId, date);
      res.json({ isAbsent });
    } catch (error) {
      console.error("Error checking teacher absence:", error);
      res.status(500).json({ message: "Failed to check teacher absence" });
    }
  });

  // Subject endpoints
  app.get("/api/subjects", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      const schoolId = req.query.schoolId as string;
      
      // Only school admins and super admins can access subjects
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      let targetSchoolId: string | undefined;

      // For school admins, only show subjects from their school
      if (user.role === 'admin') {
        if (!user.schoolId) {
          return res.status(400).json({ message: "User is not associated with a school" });
        }
        targetSchoolId = user.schoolId;
      } else if (user.role === 'super_admin') {
        // Super admin can specify schoolId or see all
        targetSchoolId = schoolId;
      }

      const subjects = await storage.getSubjects(targetSchoolId);
      res.json(subjects);
    } catch (error) {
      console.error("Error fetching subjects:", error);
      res.status(500).json({ message: "Failed to fetch subjects" });
    }
  });

  app.post("/api/subjects", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can create subjects
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const requestBody = { ...req.body };
      
      // For school admins, ensure the subject belongs to their school
      if (user.role === 'admin') {
        if (!user.schoolId) {
          return res.status(400).json({ message: "User is not associated with a school" });
        }
        requestBody.schoolId = user.schoolId;
      } else if (user.role === 'super_admin') {
        // Super admin must provide schoolId
        if (!requestBody.schoolId) {
          return res.status(400).json({ message: "School ID is required for super admin" });
        }
      }

      // Generate unique alphanumeric code
      let baseCode = requestBody.code || requestBody.name.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8);
      let finalCode = baseCode;
      let counter = 1;
      
      // Check for existing codes and append number if needed
      while (await storage.checkSubjectCodeExists(finalCode, requestBody.schoolId)) {
        finalCode = baseCode + counter;
        if (finalCode.length > 10) {
          // If too long, truncate base and try again
          baseCode = baseCode.substring(0, 6);
          finalCode = baseCode + counter;
        }
        counter++;
      }
      
      requestBody.code = finalCode;
      const validatedData = insertSubjectSchema.parse(requestBody);
      const subject = await storage.createSubject(validatedData);
      res.status(201).json(subject);
    } catch (error) {
      console.error("Error creating subject:", error);
      res.status(400).json({ message: "Invalid subject data" });
    }
  });

  app.put("/api/subjects/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      const subjectId = req.params.id;
      
      // Only school admins and super admins can update subjects
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if subject exists and belongs to the user's school (for school admins)
      const existingSubject = await storage.getSubject(subjectId);
      if (!existingSubject) {
        return res.status(404).json({ message: "Subject not found" });
      }

      if (user.role === 'admin' && user.schoolId && existingSubject.schoolId !== user.schoolId) {
        return res.status(403).json({ message: "Access denied - subject not in your school" });
      }

      const requestBody = { ...req.body };
      
      // If code is provided or name changed, ensure uniqueness
      if (requestBody.code || requestBody.name) {
        let baseCode = requestBody.code || requestBody.name.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8);
        let finalCode = baseCode;
        let counter = 1;
        
        // Check for existing codes (excluding current subject)
        while (await storage.checkSubjectCodeExists(finalCode, existingSubject.schoolId, subjectId)) {
          finalCode = baseCode + counter;
          if (finalCode.length > 10) {
            baseCode = baseCode.substring(0, 6);
            finalCode = baseCode + counter;
          }
          counter++;
        }
        
        requestBody.code = finalCode;
      }
      
      const validatedData = insertSubjectSchema.partial().parse(requestBody);
      
      // Ensure school ID cannot be changed by school admins
      if (user.role === 'admin') {
        delete validatedData.schoolId;
      }

      const updatedSubject = await storage.updateSubject(subjectId, validatedData);
      res.json(updatedSubject);
    } catch (error) {
      console.error("Error updating subject:", error);
      res.status(400).json({ message: "Failed to update subject" });
    }
  });

  app.delete("/api/subjects/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      const subjectId = req.params.id;
      
      // Only school admins and super admins can delete subjects
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if subject exists and belongs to the user's school (for school admins)
      const existingSubject = await storage.getSubject(subjectId);
      if (!existingSubject) {
        return res.status(404).json({ message: "Subject not found" });
      }

      if (user.role === 'admin' && user.schoolId && existingSubject.schoolId !== user.schoolId) {
        return res.status(403).json({ message: "Access denied - subject not in your school" });
      }

      await storage.deleteSubject(subjectId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting subject:", error);
      res.status(500).json({ message: "Failed to delete subject" });
    }
  });

  // Class endpoints
  app.get("/api/classes", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      let schoolId: string | undefined;

      // For school admins, only show classes from their school
      if (user.role === 'admin' && user.schoolId) {
        schoolId = user.schoolId;
      }

      const classes = await storage.getClasses(schoolId);
      res.json(classes);
    } catch (error) {
      console.error("Error fetching classes:", error);
      res.status(500).json({ message: "Failed to fetch classes" });
    }
  });

  app.get("/api/classes/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      const classId = req.params.id;

      const classData = await storage.getClass(classId);
      if (!classData) {
        return res.status(404).json({ message: "Class not found" });
      }

      // Check if user has access to this class
      if (user.role === 'admin' && user.schoolId && classData.schoolId !== user.schoolId) {
        return res.status(403).json({ message: "Access denied - class not in your school" });
      }

      res.json(classData);
    } catch (error) {
      console.error("Error fetching class:", error);
      res.status(500).json({ message: "Failed to fetch class" });
    }
  });

  app.post("/api/classes", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can create classes
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      // Debug logging
      console.log("User creating class:", { 
        role: user.role, 
        schoolId: user.schoolId,
        userId: user.id 
      });
      console.log("Request body:", req.body);

      // For school admins, ensure the class belongs to their school
      const requestBody = { ...req.body };
      
      if (user.role === 'admin') {
        if (!user.schoolId) {
          return res.status(400).json({ message: "User is not associated with a school" });
        }
        requestBody.schoolId = user.schoolId;
      } else if (user.role === 'super_admin') {
        // Super admin must provide schoolId
        if (!requestBody.schoolId) {
          return res.status(400).json({ message: "School ID is required for super admin" });
        }
      }

      console.log("Final request body before validation:", requestBody);
      const validatedData = insertClassSchema.parse(requestBody);
      const classData = await storage.createClass(validatedData);
      res.status(201).json(classData);
    } catch (error) {
      console.error("Error creating class:", error);
      res.status(400).json({ message: "Invalid class data" });
    }
  });

  app.put("/api/classes/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      const classId = req.params.id;
      
      // Only school admins and super admins can update classes
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if class exists and belongs to the user's school (for school admins)
      const existingClass = await storage.getClass(classId);
      if (!existingClass) {
        return res.status(404).json({ message: "Class not found" });
      }

      if (user.role === 'admin' && user.schoolId && existingClass.schoolId !== user.schoolId) {
        return res.status(403).json({ message: "Access denied - class not in your school" });
      }

      const validatedData = updateClassSchema.parse(req.body);
      
      // Ensure school ID cannot be changed by school admins
      if (user.role === 'admin') {
        delete validatedData.schoolId;
      }

      // Check if the new grade-section combination already exists in the same school
      const schoolId = existingClass.schoolId;
      const isDuplicate = await storage.checkClassExists(
        validatedData.grade || existingClass.grade,
        validatedData.section !== undefined ? validatedData.section : existingClass.section,
        schoolId,
        classId
      );

      if (isDuplicate) {
        const sectionText = validatedData.section !== undefined ? validatedData.section : existingClass.section;
        const displayName = sectionText 
          ? `Class ${validatedData.grade || existingClass.grade}${sectionText}` 
          : `Grade ${validatedData.grade || existingClass.grade}`;
        return res.status(400).json({ message: `${displayName} already exists in this school` });
      }

      const updatedClass = await storage.updateClass(classId, validatedData);
      res.json(updatedClass);
    } catch (error) {
      console.error("Error updating class:", error);
      res.status(400).json({ message: "Invalid class data" });
    }
  });

  app.delete("/api/classes/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      const classId = req.params.id;
      
      // Only school admins and super admins can delete classes
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if class exists and belongs to the user's school (for school admins)
      const existingClass = await storage.getClass(classId);
      if (!existingClass) {
        return res.status(404).json({ message: "Class not found" });
      }

      if (user.role === 'admin' && user.schoolId && existingClass.schoolId !== user.schoolId) {
        return res.status(403).json({ message: "Access denied - class not in your school" });
      }

      await storage.deleteClass(classId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting class:", error);
      res.status(500).json({ message: "Failed to delete class" });
    }
  });

  // Timetable endpoints
  app.get("/api/timetable", authMiddleware, async (req: any, res) => {
    try {
      const { classId, teacherId } = req.query;
      
      let timetable;
      if (classId) {
        timetable = await storage.getTimetableForClass(classId as string);
      } else if (teacherId) {
        timetable = await storage.getTimetableForTeacher(teacherId as string);
      } else {
        timetable = await storage.getTimetableEntries();
      }
      
      res.json(timetable);
    } catch (error) {
      console.error("Error fetching timetable:", error);
      res.status(500).json({ message: "Failed to fetch timetable" });
    }
  });

  app.get("/api/timetable/detailed", authMiddleware, async (req: any, res) => {
    try {
      const { classId, teacherId, versionId } = req.query;
      
      let timetable;
      if (versionId) {
        // Fetch specific version
        timetable = await storage.getTimetableEntriesForVersion(versionId as string);
      } else if (classId) {
        timetable = await storage.getTimetableForClass(classId as string);
      } else if (teacherId) {
        timetable = await storage.getTimetableForTeacher(teacherId as string);
      } else {
        timetable = await storage.getTimetableEntries();
      }

      // Get related data with proper school filtering
      const user = req.user;
      let schoolId: string | undefined;
      if (user.role === 'admin' && user.schoolId) {
        schoolId = user.schoolId;
      }

      const [teachers, subjects, classes] = await Promise.all([
        storage.getTeachers(schoolId),
        storage.getSubjects(schoolId),
        storage.getClasses(schoolId),
      ]);

      // Enrich timetable with related data
      const detailedTimetable = timetable.map(entry => {
        const teacher = teachers.find(t => t.id === entry.teacherId);
        const subject = subjects.find(s => s.id === entry.subjectId);
        const classData = classes.find(c => c.id === entry.classId);

        return {
          ...entry,
          teacher,
          subject,
          class: classData,
        };
      });

      res.json(detailedTimetable);
    } catch (error) {
      console.error("Error fetching detailed timetable:", error);
      res.status(500).json({ message: "Failed to fetch detailed timetable" });
    }
  });

  // Timetable Versions API
  app.get("/api/timetable-versions", authMiddleware, async (req: any, res) => {
    try {
      const { classId, weekStart, weekEnd } = req.query;
      
      if (!classId || !weekStart || !weekEnd) {
        return res.status(400).json({ message: "classId, weekStart, and weekEnd are required" });
      }

      const versions = await storage.getTimetableVersionsForClass(
        classId as string, 
        weekStart as string, 
        weekEnd as string
      );
      
      res.json(versions);
    } catch (error) {
      console.error("Error fetching timetable versions:", error);
      res.status(500).json({ message: "Failed to fetch timetable versions" });
    }
  });

  app.post("/api/timetable-versions/:id/activate", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can activate versions
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const { id } = req.params;
      const { classId } = req.body;
      
      if (!classId) {
        return res.status(400).json({ message: "classId is required" });
      }

      await storage.setActiveVersion(id, classId);
      res.json({ success: true, message: "Version activated successfully" });
    } catch (error) {
      console.error("Error activating version:", error);
      res.status(500).json({ message: "Failed to activate version" });
    }
  });


  app.get("/api/timetable/optimize", async (req, res) => {
    try {
      const suggestions = await scheduler.suggestOptimizations();
      res.json({ suggestions });
    } catch (error) {
      console.error("Error getting optimization suggestions:", error);
      res.status(500).json({ message: "Failed to get optimization suggestions" });
    }
  });

  // Manual assignment endpoints
  app.post("/api/classes/:classId/assign-teacher", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can assign teachers
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const { classId } = req.params;
      const { teacherId, subjectId } = req.body;

      // Validate required fields
      if (!teacherId || !subjectId) {
        return res.status(400).json({ message: "teacherId and subjectId are required" });
      }

      // Check if class exists and user has permission
      const classData = await storage.getClass(classId);
      if (!classData) {
        return res.status(404).json({ message: "Class not found" });
      }

      if (user.role === 'admin' && user.schoolId && classData.schoolId !== user.schoolId) {
        return res.status(403).json({ message: "Access denied - class not in your school" });
      }

      // Check if teacher exists
      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }

      // Check if subject exists
      const subject = await storage.getSubject(subjectId);
      if (!subject) {
        return res.status(404).json({ message: "Subject not found" });
      }

      // Check if the subject is already assigned to this class
      const existingAssignment = await storage.getClassSubjectAssignmentByClassAndSubject(classId, subjectId);

      if (!existingAssignment) {
        return res.status(404).json({ message: "Subject must be assigned to class first before assigning a teacher" });
      }

      if (existingAssignment.assignedTeacherId && existingAssignment.assignedTeacherId === teacherId) {
        return res.status(409).json({ message: "This teacher is already assigned to teach this subject for this class" });
      }

      // Update the class subject assignment with the teacher
      const updatedAssignment = await storage.updateClassSubjectAssignment(existingAssignment.id, {
        assignedTeacherId: teacherId
      });

      res.status(200).json(updatedAssignment);
    } catch (error) {
      console.error("Error assigning teacher to class:", error);
      res.status(500).json({ message: "Failed to assign teacher to class" });
    }
  });

  app.post("/api/classes/:classId/assign-subject", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can assign subjects
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const { classId } = req.params;
      const { subjectId } = req.body;

      if (!subjectId) {
        return res.status(400).json({ message: "subjectId is required" });
      }

      // Check if class exists and user has permission
      const classData = await storage.getClass(classId);
      if (!classData) {
        return res.status(404).json({ message: "Class not found" });
      }

      if (user.role === 'admin' && user.schoolId && classData.schoolId !== user.schoolId) {
        return res.status(403).json({ message: "Access denied - class not in your school" });
      }

      // Check if subject exists
      const subject = await storage.getSubject(subjectId);
      if (!subject) {
        return res.status(404).json({ message: "Subject not found" });
      }

      // Add subject to class's required subjects if not already present
      const requiredSubjects = classData.requiredSubjects || [];
      if (!requiredSubjects.includes(subjectId)) {
        requiredSubjects.push(subjectId);
        
        await storage.updateClass(classId, {
          requiredSubjects
        });
      }

      res.json({ message: "Subject assigned to class successfully" });
    } catch (error) {
      console.error("Error assigning subject to class:", error);
      res.status(500).json({ message: "Failed to assign subject to class" });
    }
  });

  app.delete("/api/classes/:classId/unassign-teacher/:assignmentId", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can unassign teachers
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const { classId, assignmentId } = req.params;

      // Check if class exists and user has permission
      const classData = await storage.getClass(classId);
      if (!classData) {
        return res.status(404).json({ message: "Class not found" });
      }

      if (user.role === 'admin' && user.schoolId && classData.schoolId !== user.schoolId) {
        return res.status(403).json({ message: "Access denied - class not in your school" });
      }

      // Update the class subject assignment to remove the teacher
      await storage.updateClassSubjectAssignment(assignmentId, {
        assignedTeacherId: null
      });

      res.status(200).json({ message: "Teacher unassigned successfully" });
    } catch (error) {
      console.error("Error unassigning teacher from class:", error);
      res.status(500).json({ message: "Failed to unassign teacher from class" });
    }
  });

  app.delete("/api/classes/:classId/unassign-subject/:subjectId", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can unassign subjects
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const { classId, subjectId } = req.params;

      // Check if class exists and user has permission
      const classData = await storage.getClass(classId);
      if (!classData) {
        return res.status(404).json({ message: "Class not found" });
      }

      if (user.role === 'admin' && user.schoolId && classData.schoolId !== user.schoolId) {
        return res.status(403).json({ message: "Access denied - class not in your school" });
      }

      // Remove subject from class's required subjects
      const requiredSubjects = (classData.requiredSubjects || []).filter(id => id !== subjectId);
      
      await storage.updateClass(classId, {
        requiredSubjects
      });

      res.status(204).send();
    } catch (error) {
      console.error("Error unassigning subject from class:", error);
      res.status(500).json({ message: "Failed to unassign subject from class" });
    }
  });

  // Substitution endpoints
  app.get("/api/substitutions", async (req, res) => {
    try {
      const substitutions = await storage.getSubstitutions();
      res.json(substitutions);
    } catch (error) {
      console.error("Error fetching substitutions:", error);
      res.status(500).json({ message: "Failed to fetch substitutions" });
    }
  });

  app.get("/api/substitutions/active", async (req, res) => {
    try {
      const substitutions = await storage.getActiveSubstitutions();
      res.json(substitutions);
    } catch (error) {
      console.error("Error fetching active substitutions:", error);
      res.status(500).json({ message: "Failed to fetch active substitutions" });
    }
  });

  app.post("/api/substitutions", async (req, res) => {
    try {
      const validatedData = insertSubstitutionSchema.parse(req.body);
      const substitution = await storage.createSubstitution(validatedData);
      res.status(201).json(substitution);
    } catch (error) {
      console.error("Error creating substitution:", error);
      res.status(400).json({ message: "Invalid substitution data" });
    }
  });

  app.put("/api/substitutions/:id", async (req, res) => {
    try {
      const validatedData = insertSubstitutionSchema.partial().parse(req.body);
      const substitution = await storage.updateSubstitution(req.params.id, validatedData);
      res.json(substitution);
    } catch (error) {
      console.error("Error updating substitution:", error);
      res.status(400).json({ message: "Invalid substitution data" });
    }
  });

  // Timetable validity period endpoints
  app.get("/api/timetable-validity", authMiddleware, async (req: any, res) => {
    try {
      const classId = req.query.classId as string;
      const periods = await storage.getTimetableValidityPeriods(classId);
      res.json(periods);
    } catch (error) {
      console.error("Error fetching timetable validity periods:", error);
      res.status(500).json({ message: "Failed to fetch validity periods" });
    }
  });

  app.get("/api/timetable-validity/:id", authMiddleware, async (req: any, res) => {
    try {
      const period = await storage.getTimetableValidityPeriod(req.params.id);
      if (!period) {
        return res.status(404).json({ message: "Validity period not found" });
      }
      res.json(period);
    } catch (error) {
      console.error("Error fetching validity period:", error);
      res.status(500).json({ message: "Failed to fetch validity period" });
    }
  });

  app.post("/api/timetable-validity", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can create validity periods
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const { insertTimetableValidityPeriodSchema } = await import("@shared/schema");
      const validatedData = insertTimetableValidityPeriodSchema.parse(req.body);
      
      const period = await storage.createTimetableValidityPeriod(validatedData);
      res.status(201).json(period);
    } catch (error) {
      console.error("Error creating validity period:", error);
      res.status(400).json({ message: "Invalid validity period data" });
    }
  });

  app.put("/api/timetable-validity/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can update validity periods
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const { insertTimetableValidityPeriodSchema } = await import("@shared/schema");
      const validatedData = insertTimetableValidityPeriodSchema.partial().parse(req.body);
      
      const period = await storage.updateTimetableValidityPeriod(req.params.id, validatedData);
      res.json(period);
    } catch (error) {
      console.error("Error updating validity period:", error);
      res.status(400).json({ message: "Failed to update validity period" });
    }
  });

  app.delete("/api/timetable-validity/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can delete validity periods
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deleteTimetableValidityPeriod(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting validity period:", error);
      res.status(500).json({ message: "Failed to delete validity period" });
    }
  });

  // CSV upload endpoints
  app.post("/api/upload/teachers", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const csvContent = req.file.buffer.toString('utf-8');
      const result = CSVProcessor.processTeachersCSV(csvContent);

      if (!result.success) {
        return res.status(400).json({ 
          message: "Failed to process CSV",
          errors: result.errors 
        });
      }

      // Save teachers to database
      const createdTeachers = [];
      const creationErrors = [];
      for (const teacherData of result.data) {
        try {
          const teacher = await storage.createTeacher(teacherData);
          createdTeachers.push(teacher);
        } catch (error) {
          console.error("Error creating teacher:", error);
          if (error && typeof error === 'object' && 'code' in error && 'constraint' in error) {
            if (error.code === '23505' && error.constraint === 'teachers_email_unique') {
              creationErrors.push(`Teacher with email ${teacherData.email} already exists`);
            } else {
              creationErrors.push(`Failed to create teacher: ${teacherData.name}`);
            }
          } else {
            creationErrors.push(`Failed to create teacher: ${teacherData.name}`);
          }
        }
      }

      const allErrors = [...result.errors, ...creationErrors];
      res.json({
        message: `Successfully processed ${createdTeachers.length} teachers${creationErrors.length > 0 ? ` with ${creationErrors.length} errors` : ''}`,
        teachers: createdTeachers,
        errors: allErrors
      });

    } catch (error) {
      console.error("Error uploading teachers:", error);
      res.status(500).json({ message: "Failed to upload teachers" });
    }
  });

  app.post("/api/upload/subjects", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const csvContent = req.file.buffer.toString('utf-8');
      const result = CSVProcessor.processSubjectsCSV(csvContent);

      if (!result.success) {
        return res.status(400).json({ 
          message: "Failed to process CSV",
          errors: result.errors 
        });
      }

      // Save subjects to database
      const createdSubjects = [];
      for (const subjectData of result.data) {
        try {
          const subject = await storage.createSubject(subjectData);
          createdSubjects.push(subject);
        } catch (error) {
          console.error("Error creating subject:", error);
        }
      }

      res.json({
        message: `Successfully processed ${createdSubjects.length} subjects`,
        subjects: createdSubjects,
        errors: result.errors
      });

    } catch (error) {
      console.error("Error uploading subjects:", error);
      res.status(500).json({ message: "Failed to upload subjects" });
    }
  });

  app.post("/api/upload/classes", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const csvContent = req.file.buffer.toString('utf-8');
      const result = CSVProcessor.processClassesCSV(csvContent);

      if (!result.success) {
        return res.status(400).json({ 
          message: "Failed to process CSV",
          errors: result.errors 
        });
      }

      // Save classes to database
      const createdClasses = [];
      for (const classData of result.data) {
        try {
          const classEntity = await storage.createClass(classData);
          createdClasses.push(classEntity);
        } catch (error) {
          console.error("Error creating class:", error);
        }
      }

      res.json({
        message: `Successfully processed ${createdClasses.length} classes`,
        classes: createdClasses,
        errors: result.errors
      });

    } catch (error) {
      console.error("Error uploading classes:", error);
      res.status(500).json({ message: "Failed to upload classes" });
    }
  });

  // Suggest substitute teachers
  app.get("/api/substitutions/suggest/:timetableEntryId", async (req, res) => {
    try {
      const { timetableEntryId } = req.params;
      
      // Get the timetable entry
      const timetableEntries = await storage.getTimetableEntries();
      const entry = timetableEntries.find(e => e.id === timetableEntryId);
      
      if (!entry) {
        return res.status(404).json({ message: "Timetable entry not found" });
      }

      // Find available substitute teachers - need to get school from class
      const classes = await storage.getClasses();
      const classData = classes.find(c => c.id === entry.classId);
      const schoolId = classData?.schoolId || "";
      
      const availableTeachers = await storage.getAvailableTeachers(
        entry.day,
        entry.period,
        entry.subjectId,
        schoolId
      );

      res.json(availableTeachers);
    } catch (error) {
      console.error("Error suggesting substitute teachers:", error);
      res.status(500).json({ message: "Failed to suggest substitute teachers" });
    }
  });

  // Class Subject Assignments endpoints
  app.get("/api/class-subject-assignments", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      const { classId } = req.query;
      
      // Ensure school-based filtering for admins
      let schoolId: string | undefined;
      if (user.role === 'admin' && user.schoolId) {
        schoolId = user.schoolId;
      }
      
      const assignments = await storage.getClassSubjectAssignments(classId, schoolId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching class subject assignments:", error);
      res.status(500).json({ message: "Failed to fetch class subject assignments" });
    }
  });

  app.post("/api/class-subject-assignments", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can create assignments
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const validatedData = insertClassSubjectAssignmentSchema.parse(req.body);
      
      // Check if assignment already exists
      const existing = await storage.getClassSubjectAssignmentByClassAndSubject(
        validatedData.classId, 
        validatedData.subjectId
      );
      if (existing) {
        return res.status(400).json({ message: "Assignment already exists for this class and subject" });
      }

      const assignment = await storage.createClassSubjectAssignment(validatedData);
      res.status(201).json(assignment);
    } catch (error) {
      console.error("Error creating class subject assignment:", error);
      res.status(400).json({ message: "Invalid assignment data" });
    }
  });

  app.put("/api/class-subject-assignments/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can update assignments
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const assignmentId = req.params.id;
      const updateData = req.body;
      
      const assignment = await storage.updateClassSubjectAssignment(assignmentId, updateData);
      res.json(assignment);
    } catch (error) {
      console.error("Error updating class subject assignment:", error);
      res.status(400).json({ message: "Invalid assignment data" });
    }
  });

  app.delete("/api/class-subject-assignments/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can delete assignments
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const assignmentId = req.params.id;
      await storage.deleteClassSubjectAssignment(assignmentId);
      res.json({ message: "Assignment deleted successfully" });
    } catch (error) {
      console.error("Error deleting class subject assignment:", error);
      res.status(500).json({ message: "Failed to delete assignment" });
    }
  });

  // Timetable Structure endpoints
  app.get("/api/timetable-structure", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Get timetable structure for the school
      let structure;
      if (user.role === 'super_admin') {
        const { schoolId } = req.query;
        structure = schoolId 
          ? await storage.getTimetableStructureBySchool(schoolId as string)
          : await storage.getTimetableStructures();
      } else if (user.schoolId) {
        structure = await storage.getTimetableStructureBySchool(user.schoolId);
      }
      
      res.json(structure);
    } catch (error) {
      console.error("Error fetching timetable structure:", error);
      res.status(500).json({ message: "Failed to fetch timetable structure" });
    }
  });

  app.post("/api/timetable-structure", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can create/update timetable structure
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const validatedData = insertTimetableStructureSchema.parse(req.body);
      
      // Set schoolId if not provided (for school admins)
      if (user.role === 'admin' && user.schoolId) {
        validatedData.schoolId = user.schoolId;
      }

      // Check if structure already exists for this school
      const existingStructure = await storage.getTimetableStructureBySchool(validatedData.schoolId);
      
      let structure;
      if (existingStructure) {
        // Update existing structure
        structure = await storage.updateTimetableStructure(existingStructure.id, validatedData);
      } else {
        // Create new structure
        structure = await storage.createTimetableStructure(validatedData);
      }
      
      res.status(201).json(structure);
    } catch (error) {
      console.error("Error creating/updating timetable structure:", error);
      res.status(400).json({ message: "Invalid structure data" });
    }
  });

  app.put("/api/timetable-structure/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can update timetable structure
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const structureId = req.params.id;
      const updateData = req.body;
      
      // Check if structure exists and user has permission
      const existingStructure = await storage.getTimetableStructure(structureId);
      if (!existingStructure) {
        return res.status(404).json({ message: "Timetable structure not found" });
      }

      if (user.role === 'admin' && user.schoolId && existingStructure.schoolId !== user.schoolId) {
        return res.status(403).json({ message: "Access denied - structure not in your school" });
      }
      
      const structure = await storage.updateTimetableStructure(structureId, updateData);
      res.json(structure);
    } catch (error) {
      console.error("Error updating timetable structure:", error);
      res.status(400).json({ message: "Invalid structure data" });
    }
  });

  app.delete("/api/timetable-structure/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can delete timetable structure
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const structureId = req.params.id;
      
      // Check if structure exists and user has permission
      const existingStructure = await storage.getTimetableStructure(structureId);
      if (!existingStructure) {
        return res.status(404).json({ message: "Timetable structure not found" });
      }

      if (user.role === 'admin' && user.schoolId && existingStructure.schoolId !== user.schoolId) {
        return res.status(403).json({ message: "Access denied - structure not in your school" });
      }
      
      await storage.deleteTimetableStructure(structureId);
      res.json({ message: "Timetable structure deleted successfully" });
    } catch (error) {
      console.error("Error deleting timetable structure:", error);
      res.status(500).json({ message: "Failed to delete timetable structure" });
    }
  });

  // Timetable generation endpoints
  app.post("/api/timetable/generate", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can generate timetables
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      // Optional class ID parameter for generating timetable for specific class
      const { classId } = req.body;


      const result = await scheduler.generateTimetable(classId, user.schoolId);
      res.json(result);
    } catch (error) {
      console.error("Error generating timetable:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to generate timetable" 
      });
    }
  });

  // Validate Timetable
  app.get("/api/timetable/validate", authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only school admins and super admins can validate timetables
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const validation = await scheduler.validateTimetable();
      res.json(validation);
    } catch (error) {
      console.error("Error validating timetable:", error);
      res.status(500).json({ 
        isValid: false, 
        conflicts: ["Unable to validate timetable due to system error"]
      });
    }
  });

  app.get("/api/timetable/suggestions", authMiddleware, async (req: any, res) => {
    try {
      const suggestions = await scheduler.suggestOptimizations();
      res.json({ suggestions });
    } catch (error) {
      console.error("Error getting timetable suggestions:", error);
      res.status(500).json({ message: "Failed to get suggestions" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
