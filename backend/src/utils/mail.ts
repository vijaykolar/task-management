import Mailgen from "mailgen";
import nodemailer from "nodemailer";
import { ApiError } from "./api-error.js";

type MailgenContent = Mailgen.Content;

interface SendEmailOptions {
  email: string;
  subject: string;
  mailgenContent: MailgenContent;
}

const isSmtpConfigured = () =>
  Boolean(
    process.env.MAILTRAP_SMTP_HOST &&
      process.env.MAILTRAP_SMTP_USER &&
      process.env.MAILTRAP_SMTP_PASS,
  );

/**
 * Sends an email, or throws a 503 ApiError so callers can react (e.g. roll back
 * a registration). Without SMTP settings in development, the email is printed
 * to the console instead so links can still be used locally.
 */
const sendEmail = async (options: SendEmailOptions): Promise<void> => {
  const mailGenerator = new Mailgen({
    theme: "default",
    product: {
      name: "Project Camp",
      link: process.env.CORS_ORIGIN?.split(",")[0] || "http://localhost:5173",
    },
  });

  const emailTextual: string = mailGenerator.generatePlaintext(
    options.mailgenContent,
  );

  if (!isSmtpConfigured()) {
    if (process.env.NODE_ENV === "production") {
      console.error("SMTP is not configured; cannot send email");
      throw new ApiError(503, "Email service is not configured");
    }
    console.warn(
      [
        "",
        "📧 SMTP not configured — email NOT sent. Development preview:",
        `   To: ${options.email}`,
        `   Subject: ${options.subject}`,
        emailTextual,
        "",
      ].join("\n"),
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_SMTP_HOST,
    port: Number(process.env.MAILTRAP_SMTP_PORT) || 2525,
    auth: {
      user: process.env.MAILTRAP_SMTP_USER,
      pass: process.env.MAILTRAP_SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || "Project Camp <no-reply@projectcamp.dev>",
      to: options.email,
      subject: options.subject,
      text: emailTextual,
      html: mailGenerator.generate(options.mailgenContent),
    });
  } catch (error) {
    console.error("Failed to send email:", error);
    throw new ApiError(
      503,
      "We couldn't send the email right now. Please try again later.",
    );
  }
};

const emailVerificationMailgenContent = (
  username: string,
  verficationUrl: string,
): MailgenContent => {
  return {
    body: {
      name: username,
      intro: "Welcome to Project Camp! We're excited to have you on board.",
      action: {
        instructions:
          "To verify your email please click on the following button",
        button: {
          color: "#22BC66",
          text: "Verify your email",
          link: verficationUrl,
        },
      },
      outro:
        "Need help, or have questions? Just reply to this email, we'd love to help.",
    },
  };
};

const forgotPasswordMailgenContent = (
  username: string,
  passwordResetUrl: string,
): MailgenContent => {
  return {
    body: {
      name: username,
      intro: "We got a request to reset the password of your account",
      action: {
        instructions:
          "To reset your password click on the following button or link",
        button: {
          color: "#22BC66",
          text: "Reset password",
          link: passwordResetUrl,
        },
      },
      outro:
        "Need help, or have questions? Just reply to this email, we'd love to help.",
    },
  };
};

const roleNames: Record<string, string> = {
  admin: "an Admin",
  project_admin: "a Project Admin",
  member: "a Member",
};

/** Sent to an existing user who was added to a project */
const projectAddedMailgenContent = (
  username: string,
  { projectName, inviterName, role, projectUrl }: ProjectEmailDetails,
): MailgenContent => {
  return {
    body: {
      name: username,
      intro: `${inviterName} added you to the project "${projectName}" as ${roleNames[role] ?? role}.`,
      action: {
        instructions: "Open the project to see its tasks and notes:",
        button: {
          color: "#22BC66",
          text: "Open project",
          link: projectUrl,
        },
      },
      outro: "You received this because a project admin added your email.",
    },
  };
};

/** Sent to an email without an account, asking them to sign up */
const projectInviteMailgenContent = ({
  projectName,
  inviterName,
  role,
  projectUrl: signupUrl,
  expiresInDays,
}: ProjectEmailDetails & { expiresInDays: number }): MailgenContent => {
  return {
    body: {
      intro: `${inviterName} invited you to join the project "${projectName}" on Project Camp as ${roleNames[role] ?? role}.`,
      action: {
        instructions: `Create an account with this email address and verify it to join. The invitation expires in ${expiresInDays} days.`,
        button: {
          color: "#22BC66",
          text: "Accept invitation",
          link: signupUrl,
        },
      },
      outro: "If you weren't expecting this invitation, you can ignore it.",
    },
  };
};

interface TaskEmailDetails {
  actorName: string;
  projectName: string;
  taskTitle: string;
  taskUrl: string;
}

const taskAssignedMailgenContent = (
  username: string,
  { actorName, projectName, taskTitle, taskUrl }: TaskEmailDetails,
): MailgenContent => ({
  body: {
    name: username,
    intro: `${actorName} assigned you the task "${taskTitle}" in ${projectName}.`,
    action: {
      instructions: "Open the task to see the details:",
      button: { color: "#22BC66", text: "View task", link: taskUrl },
    },
    outro:
      "You can turn off these emails in your account settings on Project Camp.",
  },
});

const mentionedMailgenContent = (
  username: string,
  {
    actorName,
    projectName,
    taskTitle,
    taskUrl,
    excerpt,
  }: TaskEmailDetails & { excerpt: string },
): MailgenContent => ({
  body: {
    name: username,
    intro: [
      `${actorName} mentioned you in a comment on "${taskTitle}" (${projectName}):`,
      excerpt ? `“${excerpt}”` : "",
    ].filter(Boolean),
    action: {
      instructions: "Reply or see the full conversation:",
      button: { color: "#22BC66", text: "View comment", link: taskUrl },
    },
    outro:
      "You can turn off these emails in your account settings on Project Camp.",
  },
});

interface ProjectEmailDetails {
  projectName: string;
  inviterName: string;
  role: string;
  projectUrl: string;
}

export {
  mentionedMailgenContent,
  taskAssignedMailgenContent,
  emailVerificationMailgenContent,
  forgotPasswordMailgenContent,
  projectAddedMailgenContent,
  projectInviteMailgenContent,
  sendEmail,
};
export type { MailgenContent, SendEmailOptions };
