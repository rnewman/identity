import sys
import os
from runxpcshelltests import XPCShellTests, XPCShellOptions

class IdentityTests(XPCShellTests):

  def getHeadFiles(self, testdir):
      return super(IdentityTests, self).getHeadFiles(testdir)


def main():
  parser = XPCShellOptions()
  options, args = parser.parse_args()

  if len(args) < 2 and options.manifest is None or \
     (len(args) < 1 and options.manifest is not None):
     print >>sys.stderr, """Usage: %s <path to xpcshell> <test dirs>
           or: %s --manifest=test.manifest <path to xpcshell>""" % (sys.argv[0],
                                                           sys.argv[0])
     sys.exit(1)

  xpcsh = IdentityTests()

  if options.interactive and not options.testPath:
    print >>sys.stderr, "Error: You must specify a test filename in interactive mode!"
    sys.exit(1)

  if not xpcsh.runTests(args[0], testdirs=args[1:], **options.__dict__):
    sys.exit(1)

if __name__ == '__main__':
  main()
