# cabal/views/customerorders.py

from django.shortcuts import render


def CustomerOrders(request):
    template_name = "customerorders/parser_interface.html"
    return render(request, template_name, context={})
