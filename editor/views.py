from django.shortcuts import render, redirect
from django.http import JsonResponse
from django.core.exceptions import ObjectDoesNotExist
from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token

from .models import User

# Create your views here.
def index(request, path=None):

    if request.POST:
        if path == "register":
            return register(request)

        if path == "login":
            return login_view(request)

    # GET request
    if path == "logout":
        logout(request)
        return redirect("/")

    return render(request, 'editor/index.html')


def register(request):

    # Looks like a redundant dict comprehension but
    # else it's either immutable or values are lists of len() = 1
    form = {key: value for key, value in request.POST.items()}
    del form["csrfmiddlewaretoken"]

    # Check passwords are same
    if not form.pop("pwConfirm") == form["password"]:
        return JsonResponse({"success": False,
                            "message": "Passwords don't match!",
                            "csrfToken": get_token(request)
                            })

    # Check pw and name lengths, should never happen
    if not all((1 < len(x) and len(x) < 31 for _, x in form.items())):
        return JsonResponse({"success": False,
             "message": "Names and passwords need to be less than 30 characters, you need to have a password!",
             "csrfToken": get_token(request)
             })

    # Check name already exists
    try:
        User.objects.get(username=form["username"])
        return JsonResponse({"success": False,
                            "message": "Username already exists!",
                            "csrfToken": get_token(request)
                            })
    except ObjectDoesNotExist:
        User.objects.create_user(username=form["username"], password=form["password"])
        return login_view(request)


def login_view(request):

    form = request.POST
    
    # Authenticate user
    user = authenticate(username=form["username"], password=form["password"])

    # Handle failure
    if user is None:
        return JsonResponse({"success": False,
                            "message": "Bad username or password!",
                            "csrfToken": get_token(request)
                            })

    # Handle success
    login(request, user)
    return JsonResponse({"success": True, "csrfToken": get_token(request)})